import ExcelJS from 'exceljs';
import type { Faq,FaqInput,FaqLibraryType,KnowledgeAttachmentKind } from '@campus/contracts';
import { AppError } from '../errors.js';
import { injectOleAttachments } from './ooxml-ole.js';

const ANSWER_HEADERS=['序号','标准问题','标准答案','匹配关键词（用；分隔）','分类','状态'] as const;
const ANSWER_ATTACHMENT_HEADERS=[...ANSWER_HEADERS,'附件名称（用；分隔）','附件（双击打开）'] as const;
const LEGACY_ANSWER_HEADERS=['序号','标准问题','标准答案','匹配关键词（用；分隔）','分类','状态','附件名称（用；分隔）','附件数据索引'] as const;
const SENSITIVE_HEADERS=['序号','敏感词','同义词（用；分隔）','分类','状态','拦截提示'] as const;
const MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export interface EmbeddedFaqAttachment {faqId:string;name:string;kind:KnowledgeAttachmentKind;mime:string;content:Buffer;packagePath?:string}
export interface FaqWorkbookOptions {embedAttachments?:boolean;includePackageLinks?:boolean}

const cellText=(value:ExcelJS.CellValue)=>{
  if(value===null||value===undefined)return '';
  if(typeof value==='object'){
    if('text' in value)return String(value.text??'').trim();
    if('result' in value)return String(value.result??'').trim();
    if('richText' in value)return value.richText.map(x=>x.text).join('').trim();
  }
  return String(value).trim();
};

export async function createFaqWorkbook(items:Faq[],libraryType:FaqLibraryType,attachments:EmbeddedFaqAttachment[]=[],options:FaqWorkbookOptions={}){
  const answer=libraryType==='answer',book=new ExcelJS.Workbook();book.creator='校园教务小助手';book.created=new Date();
  const includeAttachments=answer&&attachments.length>0;
  const sheet=book.addWorksheet(answer?'答疑题库':'敏感词库',{views:[{state:'frozen',ySplit:1}]});
  const byFaq=new Map<string,{index:string;file:EmbeddedFaqAttachment}[]>();
  attachments.forEach((file,index)=>{const list=byFaq.get(file.faqId)||[];list.push({index:`ATT-${index+1}`,file});byFaq.set(file.faqId,list);});
  sheet.addRow([...(answer?(includeAttachments?ANSWER_ATTACHMENT_HEADERS:ANSWER_HEADERS):SENSITIVE_HEADERS)]);
  items.forEach((item,index)=>{
    if(answer){const linked=byFaq.get(item.id)||[],external=options.includePackageLinks?linked.find(x=>x.file.packagePath)?.file.packagePath:undefined;sheet.addRow(includeAttachments?[index+1,item.question,item.answer,item.keywords.join('；'),item.category,item.status==='active'?'已启用':'已停用',linked.map(x=>x.file.name).join('；'),external?{text:linked.length===1?'打开真实附件':'打开首个附件（其余见附件清单）',hyperlink:external}:linked.length?'双击附件条打开':'']:[index+1,item.question,item.answer,item.keywords.join('；'),item.category,item.status==='active'?'已启用':'已停用']);}
    else sheet.addRow([index+1,item.question,item.keywords.join('；'),item.category,item.status==='active'?'已启用':'已停用',item.answer]);
  });
  sheet.columns=answer?(includeAttachments?[{width:9},{width:34},{width:58},{width:34},{width:20},{width:12},{width:36},{width:72}]:[{width:9},{width:34},{width:58},{width:34},{width:20},{width:12}]):[{width:9},{width:34},{width:42},{width:20},{width:12},{width:58}];
  const header=sheet.getRow(1);header.height=28;header.font={bold:true,color:{argb:'FFFFFFFF'}};header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245B78'}};header.alignment={vertical:'middle',horizontal:'center'};
  sheet.eachRow((row,rowIndex)=>{if(rowIndex===1)return;row.alignment={vertical:'top',wrapText:true};row.height=42;row.eachCell(cell=>{cell.border={bottom:{style:'hair',color:{argb:'FFD8E0E6'}}};});});
  if(includeAttachments)items.forEach((item,index)=>{const count=byFaq.get(item.id)?.length||0;if(count)sheet.getRow(index+2).height=Math.max(48,count*48);});
  sheet.autoFilter={from:'A1',to:`${answer&&includeAttachments?'H':'F'}1`};
  const guide=book.addWorksheet('填写说明');guide.columns=[{width:24},{width:84}];guide.addRows(answer?[
    ['字段','填写要求'],['标准问题','必填，最多 200 字；同一问题不要重复。'],['标准答案','必填，最多 1500 字。'],['匹配关键词（用；分隔）','必填，多个关键词使用中文或英文分号分隔，最多 20 个。'],['分类','必填；不存在的分类会在导入时自动创建。'],['状态','导入后统一为“已停用”，老师核实后再在系统中启用。'],...(includeAttachments?[['附件','仅完整资料包包含真实附件；普通 Excel 导出不读取、不复制附件。']]:[])
  ]:[
    ['字段','填写要求'],['敏感词','必填，每行一个需要拦截的词或短语。'],['同义词（用；分隔）','可填写近义表达；留空时自动使用敏感词本身。'],['分类','必填；不存在的分类会在导入时自动创建。'],['状态','导入后统一为“已停用”，老师核实后再启用。'],['拦截提示','可留空，系统将使用默认群聊规范提示。']
  ]);guide.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};guide.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245B78'}};guide.eachRow(row=>{row.alignment={vertical:'top',wrapText:true};row.height=28;});
  if(answer&&options.includePackageLinks&&attachments.some(file=>file.packagePath)){
    const attachmentSheet=book.addWorksheet('附件清单',{views:[{state:'frozen',ySplit:1}]});attachmentSheet.addRow(['序号','题库序号','标准问题','附件名称','附件类型','打开资料']);
    let attachmentIndex=0;for(const file of attachments){const itemIndex=items.findIndex(item=>item.id===file.faqId);if(itemIndex<0||!file.packagePath)continue;attachmentSheet.addRow([++attachmentIndex,itemIndex+1,items[itemIndex].question,file.name,file.kind,{text:'双击打开真实附件',hyperlink:file.packagePath}]);}
    attachmentSheet.columns=[{width:9},{width:12},{width:46},{width:54},{width:14},{width:24}];const attachmentHeader=attachmentSheet.getRow(1);attachmentHeader.height=28;attachmentHeader.font={bold:true,color:{argb:'FFFFFFFF'}};attachmentHeader.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF245B78'}};attachmentHeader.alignment={vertical:'middle',horizontal:'center'};attachmentSheet.eachRow((row,index)=>{if(index===1)return;row.height=30;row.alignment={vertical:'middle',wrapText:true};});attachmentSheet.autoFilter={from:'A1',to:'F1'};
  }
  const base=Buffer.from(await book.xlsx.writeBuffer()),rowByFaq=new Map(items.map((item,index)=>[item.id,index+2])),slotByFaq=new Map<string,number>();
  const buffer=answer&&options.embedAttachments!==false?await injectOleAttachments(base,'答疑题库',attachments.map(file=>{const slot=slotByFaq.get(file.faqId)||0;slotByFaq.set(file.faqId,slot+1);return {name:file.name,mime:file.mime,content:file.content,row:rowByFaq.get(file.faqId)||2,column:8,slot};})):base;
  return {buffer,mime:MIME};
}

export async function parseFaqWorkbook(buffer:Buffer,libraryType:FaqLibraryType):Promise<FaqInput[]>{
  const book=new ExcelJS.Workbook();
  try{await book.xlsx.load(buffer as unknown as ExcelJS.Buffer);}catch{throw new AppError(400,'INVALID_XLSX','无法读取该 Excel 文件，请使用系统导出的固定模板。');}
  const answer=libraryType==='answer',sheet=book.getWorksheet(answer?'答疑题库':'敏感词库')||book.worksheets[0];
  if(!sheet)throw new AppError(400,'INVALID_XLSX','Excel 中缺少词库工作表。');
  const actual=Array.from({length:answer?8:SENSITIVE_HEADERS.length},(_,index)=>cellText(sheet.getCell(1,index+1).value));
  const current=(answer?ANSWER_HEADERS:SENSITIVE_HEADERS).every((value,index)=>actual[index]===value)&&(!answer||actual.slice(ANSWER_HEADERS.length).every(value=>!value)),withAttachments=answer&&ANSWER_ATTACHMENT_HEADERS.every((value,index)=>actual[index]===value),legacy=answer&&LEGACY_ANSWER_HEADERS.every((value,index)=>actual[index]===value);
  if(!current&&!withAttachments&&!legacy)throw new AppError(400,'INVALID_XLSX_TEMPLATE','表头或列顺序不符合固定模板，请先导出模板后填写。');
  const items:FaqInput[]=[];
  for(let rowNumber=2;rowNumber<=sheet.rowCount;rowNumber++){
    const row=sheet.getRow(rowNumber),question=cellText(row.getCell(2).value),answerText=answer?cellText(row.getCell(3).value):cellText(row.getCell(6).value),keywordText=cellText(row.getCell(answer?4:3).value),category=cellText(row.getCell(answer?5:4).value);
    if(!question&&!answerText&&!keywordText&&!category)continue;
    const keywords=[...new Set((keywordText||question).split(/[;；,，\n]/).map(x=>x.trim()).filter(Boolean))];
    const reply=answerText||(answer?'':'该消息包含敏感内容，请遵守群聊规范后重新提问。');
    if(!question||!reply||!keywords.length||!category)throw new AppError(400,'INVALID_XLSX_ROW',`第 ${rowNumber} 行缺少${answer?'标准问题、标准答案、关键词或分类':'敏感词或分类'}。`);
    items.push({question,answer:reply,keywords,category,status:'disabled',confirmed:false,libraryType});
  }
  if(!items.length)throw new AppError(400,'EMPTY_XLSX',`Excel 中没有可导入的${answer?'题目':'敏感词'}。`);
  if(items.length>1000)throw new AppError(400,'XLSX_LIMIT',`一次最多导入 1000 条${answer?'题目':'敏感词'}。`);
  return items;
}
