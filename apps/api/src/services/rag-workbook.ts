import ExcelJS from 'exceljs';
import type { RagChunk,RagDocument,RagFolder,RagGraph } from '@campus/contracts';
import { injectOleAttachments } from './ooxml-ole.js';

const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export interface EmbeddedRagFile {documentId:string;name:string;mime:string;content:Buffer;packagePath?:string}
export interface RagWorkbookOptions {embedAttachments?:boolean;includePackageLinks?:boolean}

function style(sheet:ExcelJS.Worksheet,widths:number[]){
  sheet.columns=widths.map(width=>({width}));
  const header=sheet.getRow(1);header.font={bold:true,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245B78'}};header.alignment={vertical:'middle',horizontal:'center'};header.height=28;
  sheet.views=[{state:'frozen',ySplit:1}];sheet.eachRow((row,index)=>{if(index===1)return;row.alignment={vertical:'top',wrapText:true};});
}

export async function createRagWorkbook(input:{folders:RagFolder[];documents:RagDocument[];chunks:RagChunk[];graphs:RagGraph[];files:EmbeddedRagFile[]},options:RagWorkbookOptions={}){
  const book=new ExcelJS.Workbook();book.creator='校园教务小助手';book.created=new Date();
  const folderNames=new Map(input.folders.map(folder=>[folder.id,folder.name])),fileIndex=new Map(input.files.map(file=>[file.documentId,file]));
  const documents=book.addWorksheet('资料目录');documents.addRow(['序号','资料名称','目录','状态','进度','文件大小（字节）','Chunk 数','Token 数','图谱节点','图谱关系','原始资料（双击打开）','上传时间']);
  input.documents.forEach((document,index)=>{const file=fileIndex.get(document.id),external=options.includePackageLinks?file?.packagePath:undefined;documents.addRow([index+1,document.name,document.folderId?folderNames.get(document.folderId)||'未分类':'未分类',document.status,document.progress,document.size,document.chunkCount,document.tokenCount,document.graphNodeCount,document.graphEdgeCount,external?{text:'双击打开真实资料',hyperlink:external}:file?'双击资料条打开':'',new Date(document.createdAt)]);if(file)documents.getRow(index+2).height=48;});style(documents,[8,38,22,14,10,18,12,14,12,12,72,22]);documents.autoFilter={from:'A1',to:'L1'};
  const chunks=book.addWorksheet('Chunk切片');chunks.addRow(['资料名称','切片序号','Token 数','关键词','内容']);input.chunks.forEach(chunk=>chunks.addRow([chunk.documentName,chunk.position+1,chunk.tokenCount,chunk.keywords.join('；'),chunk.content]));style(chunks,[36,12,12,35,100]);
  const nodes=book.addWorksheet('知识图谱节点');nodes.addRow(['资料名称','节点','类型','说明']);for(const graph of input.graphs)for(const node of graph.nodes)nodes.addRow([graph.document.name,node.label,node.type,node.description]);style(nodes,[36,32,18,80]);
  const edges=book.addWorksheet('知识图谱关系');edges.addRow(['资料名称','源节点','关系','目标节点']);for(const graph of input.graphs){const labels=new Map(graph.nodes.map(node=>[node.id,node.label]));for(const edge of graph.edges)edges.addRow([graph.document.name,labels.get(edge.sourceId)||edge.sourceId,edge.relation,labels.get(edge.targetId)||edge.targetId]);}style(edges,[36,32,24,32]);
  const guide=book.addWorksheet('导出说明');guide.addRows([['内容','说明'],['资料目录','每份资料的目录、处理状态、解析统计和原始资料。'],['Chunk切片','解析后的结构化知识切片。'],['知识图谱节点','DeepSeek 构建的知识节点。'],['知识图谱关系','节点之间的结构化关系。'],['原始资料','完整文件以 OLE 对象嵌入“资料目录”同行；在 Microsoft Excel 中双击带文件名的资料条即可打开。']]);style(guide,[24,90]);
  const base=Buffer.from(await book.xlsx.writeBuffer()),rowByDocument=new Map(input.documents.map((document,index)=>[document.id,index+2])),buffer=options.embedAttachments===false?base:await injectOleAttachments(base,'资料目录',input.files.map(file=>({name:file.name,mime:file.mime,content:file.content,row:rowByDocument.get(file.documentId)||2,column:11})));
  return {buffer,mime:MIME};
}
