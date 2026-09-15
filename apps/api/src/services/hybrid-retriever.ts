import { Document } from '@langchain/core/documents';
import { BaseRetriever } from '@langchain/core/retrievers';
import { EnsembleRetriever } from '@langchain/classic/retrievers/ensemble';
import type { RagSearchHit } from '@campus/contracts';
import { normalize } from '../db/store.js';

export interface UnifiedChunk {
  id:string;
  documentId:string;
  documentName:string;
  position:number;
  content:string;
  tokenCount:number;
  keywords:string[];
  embedding:number[];
}

type RankedChunk={chunk:UnifiedChunk;score:number};

export function lexicalTerms(value:string,unique=true){
  const lower=value.toLowerCase(),base=lower.match(/[\p{Script=Han}]{2,8}|[a-z0-9]{2,30}/gu)||[],han=[...lower.replace(/[^\p{Script=Han}]/gu,'')],grams=Array.from({length:Math.max(0,han.length-1)},(_,index)=>han.slice(index,index+2).join('')),terms=[...base,...grams];
  return unique?[...new Set(terms)]:terms;
}

export function localVector(value:string,model='local/hash-384'){
  const size=model==='local/tfidf'?768:384,result=Array<number>(size).fill(0),bigrams=Array.from({length:Math.max(0,value.length-1)},(_,index)=>value.slice(index,index+2)).filter(item=>!/[\s\p{P}]/u.test(item)),terms=model==='local/tfidf'?[...lexicalTerms(value),...bigrams]:lexicalTerms(value);
  for(const term of terms){let hash=2166136261;for(const char of term)hash=(hash^char.codePointAt(0)!)*16777619>>>0;result[hash%size]+=model==='local/tfidf'?1/Math.sqrt(Math.max(1,term.length)):1;}
  const length=Math.sqrt(result.reduce((total,item)=>total+item*item,0))||1;
  return result.map(item=>item/length);
}

const cosine=(left:number[],right:number[])=>left.reduce((total,item,index)=>total+item*(right[index]||0),0);

class SnapshotRetriever extends BaseRetriever {
  lc_namespace=['campus','knowledge','unified-collection'];
  constructor(private rank:(query:string)=>RankedChunk[]){super();}
  async _getRelevantDocuments(query:string){
    return this.rank(query).map(({chunk,score})=>new Document({
      // EnsembleRetriever currently uses pageContent as its identity key. The
      // UUID keeps identical paragraphs from different source files distinct.
      pageContent:chunk.id,
      metadata:{chunkId:chunk.id,retrieverScore:score},
    }));
  }
}

export class UnifiedCollectionEnsembleRetriever {
  private documents:{chunk:UnifiedChunk;terms:string[]}[];
  private averageLength:number;
  constructor(private chunks:UnifiedChunk[],private embeddingModel:string){
    this.documents=chunks.map(chunk=>({chunk,terms:lexicalTerms(chunk.content,false)}));
    this.averageLength=this.documents.reduce((total,item)=>total+item.terms.length,0)/Math.max(1,this.documents.length);
  }

  private sparse(query:string,limit:number):RankedChunk[]{
    const queryTerms=lexicalTerms(query),querySet=new Set(queryTerms),documentFrequency=new Map(queryTerms.map(term=>[term,0]));
    for(const item of this.documents){const present=new Set(item.terms.filter(term=>querySet.has(term)));for(const term of present)documentFrequency.set(term,(documentFrequency.get(term)||0)+1);}
    return this.documents.map(({chunk,terms})=>{
      const counts=new Map<string,number>();for(const term of terms)counts.set(term,(counts.get(term)||0)+1);
      const score=queryTerms.reduce((total,term)=>{const frequency=counts.get(term)||0;if(!frequency)return total;const documentCount=documentFrequency.get(term)||0,idf=Math.log(1+(this.documents.length-documentCount+.5)/(documentCount+.5)),denominator=frequency+1.2*(1-.75+.75*terms.length/Math.max(1,this.averageLength));return total+idf*(frequency*2.2/denominator);},0);
      return {chunk,score};
    }).filter(item=>item.score>0).sort((left,right)=>right.score-left.score).slice(0,limit);
  }

  private dense(query:string,limit:number):RankedChunk[]{
    const queryVector=localVector(query,this.embeddingModel);
    return this.chunks.map(chunk=>({chunk,score:cosine(queryVector,chunk.embedding)})).filter(item=>item.score>=.04).sort((left,right)=>right.score-left.score).slice(0,limit);
  }

  async search(query:string,limit:number):Promise<RagSearchHit[]>{
    if(!this.chunks.length||!query.trim())return [];
    const candidateLimit=Math.min(this.chunks.length,Math.max(20,limit*4)),sparseRanked=this.sparse(query,candidateLimit),denseRanked=this.dense(query,candidateLimit);
    if(!sparseRanked.length&&!denseRanked.length)return [];
    const sparseRanks=new Map(sparseRanked.map((item,index)=>[item.chunk.id,index+1])),denseRanks=new Map(denseRanked.map((item,index)=>[item.chunk.id,index+1])),sparseScores=new Map(sparseRanked.map(item=>[item.chunk.id,item.score])),denseScores=new Map(denseRanked.map(item=>[item.chunk.id,item.score])),sparseMax=sparseRanked[0]?.score||1,chunkById=new Map(this.chunks.map(chunk=>[chunk.id,chunk]));
    const ensemble=new EnsembleRetriever({retrievers:[new SnapshotRetriever(()=>sparseRanked),new SnapshotRetriever(()=>denseRanked)],weights:[.45,.55],c:60}),documents=await ensemble.invoke(query),hits:RagSearchHit[]=[];
    for(const document of documents){
      const id=String(document.metadata.chunkId||document.pageContent),chunk=chunkById.get(id);if(!chunk)continue;
      if(hits.some(hit=>hit.documentId===chunk.documentId&&Math.abs(hit.position-chunk.position)<=1))continue;
      const sparseRank=sparseRanks.get(id),denseRank=denseRanks.get(id),keywordScore=(sparseScores.get(id)||0)/sparseMax,vectorScore=denseScores.get(id)||0,rerankScore=(sparseRank ? 0.45/(60+sparseRank) : 0)+(denseRank ? 0.55/(60+denseRank) : 0);
      hits.push({id:chunk.id,documentId:chunk.documentId,documentName:chunk.documentName,position:chunk.position,content:chunk.content,tokenCount:chunk.tokenCount,keywords:chunk.keywords,keywordScore,vectorScore,rerankScore});
      if(hits.length>=limit)break;
    }
    return hits;
  }
}

export function toUnifiedChunks(rows:any[]):UnifiedChunk[]{
  return rows.map(row=>({id:row.id,documentId:row.document_id,documentName:row.document_name,position:row.position,content:row.content,tokenCount:row.token_count,keywords:row.keywords,embedding:row.embedding}));
}
