import { createHash } from 'node:crypto';
import type { MaterialCategory } from '@campus/contracts';
import { MATERIAL_UNRELATED_CATEGORY,type Store } from '../db/store.js';
import type { Models } from './models.js';

export const materialSourceKey=(messageId:string,name:string,size:number)=>createHash('sha256').update(`${messageId}:${name}:${size}`).digest('hex');

export class MaterialInboxService{
  constructor(private store:Store,private models:Models){}
  async classify(name:string,categories:MaterialCategory[]):Promise<string|null>{
    const normalized=name.normalize('NFKC').toLowerCase(),unrelated=categories.find(category=>category.name===MATERIAL_UNRELATED_CATEGORY),candidates=categories.filter(category=>category.name!==MATERIAL_UNRELATED_CATEGORY);
    if(!candidates.length)return unrelated?.id||null;
    try{const result=await this.models.completeJson<{categoryId:string|null}>('你是资料归档分类器。只能根据文件名语义，从给定类别中选择最匹配的一项。没有明确对应类别时 categoryId 必须为 null，不能勉强分类。只输出 JSON：{"categoryId":"类别ID或null"}。',{fileName:name,categories:candidates.map(category=>({id:category.id,name:category.name}))},120);if(candidates.some(category=>category.id===result.categoryId))return result.categoryId;}catch{/* When the model is unavailable, keep a deterministic filename fallback. */}
    return candidates.find(category=>normalized.includes(category.name.normalize('NFKC').toLowerCase()))?.id||unrelated?.id||null;
  }
}
