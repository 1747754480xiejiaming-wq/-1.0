import { extname } from 'node:path';
import * as CFB from 'cfb';
import JSZip from 'jszip';
import { createCanvas } from '@napi-rs/canvas';

const REL_NS='http://schemas.openxmlformats.org/package/2006/relationships';
const DOC_REL_NS='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const DOC_REL=`${DOC_REL_NS}/`;
const DRAWING_NS='http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';
const ART_NS='http://schemas.openxmlformats.org/drawingml/2006/main';
const ART_2010_NS='http://schemas.microsoft.com/office/drawing/2010/main';
const PACKAGE_CLSID='0c00030000000000c000000000000046';
const COMPOBJ=Buffer.from('0100feff030a0000ffffffff0c00030000000000c0000000000000460c0000004f4c45205061636b6167650000000000080000005061636b61676500f439b271000000000000000000000000','hex');

export interface OleAttachment {name:string;mime:string;content:Buffer;row:number;column:number;slot?:number}
export interface ExtractedOleAttachment {name:string;content:Buffer}

const xmlEscape=(value:string)=>value.replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]!));
const xmlUnescape=(value:string)=>value.replace(/&(?:lt|gt|amp|quot|apos);/g,entity=>({'&lt;':'<','&gt;':'>','&amp;':'&','&quot;':'"','&apos;':"'"}[entity]!));
const uint16=(value:number)=>{const result=Buffer.alloc(2);result.writeUInt16LE(value);return result;};
const uint32=(value:number)=>{const result=Buffer.alloc(4);result.writeUInt32LE(value);return result;};

function unicodeField(value:string){const encoded=Buffer.from(value,'utf16le');return Buffer.concat([uint32(value.length),encoded]);}
function asciiFallback(name:string,index:number){
  const extension=extname(name).replace(/[^.A-Za-z0-9]/g,'').slice(0,12),base=name.slice(0,name.length-extension.length).replace(/[^A-Za-z0-9._-]/g,'_').replace(/^_+|_+$/g,'').slice(0,48);
  return `${base||`attachment-${index+1}`}${extension}`;
}

export function createOlePackage(name:string,content:Buffer,index=0){
  const fallback=asciiFallback(name,index),ascii=Buffer.from(fallback,'utf8'),zero=Buffer.from([0]);
  const body=Buffer.concat([
    uint16(2),ascii,zero,ascii,zero,uint16(0),uint16(3),uint32(ascii.length+1),ascii,zero,uint32(content.length),content,
    unicodeField(name),unicodeField(name),unicodeField(name)
  ]);
  const native=Buffer.concat([uint32(body.length),body]),cfb=CFB.utils.cfb_new({CLSID:PACKAGE_CLSID});
  CFB.utils.cfb_add(cfb,'\u0001CompObj',COMPOBJ);
  CFB.utils.cfb_add(cfb,'\u0001Ole10Native',native);
  CFB.utils.cfb_del(cfb,'\u0001Sh33tJ5');
  return Buffer.from(CFB.write(cfb,{type:'buffer',fileType:'cfb'}));
}

function nextRelationshipId(xml:string,start=1){let next=start;for(const match of xml.matchAll(/\bId="rId(\d+)"/g))next=Math.max(next,Number(match[1])+1);return next;}
function relationship(id:string,type:string,target:string){return `<Relationship Id="${id}" Type="${type}" Target="${target}"/>`;}
function addRelationships(xml:string,entries:string[]){return xml.replace('</Relationships>',`${entries.join('')}</Relationships>`);}
function marker(column:number,row:number,slot=0){
  const col=column-1,rowIndex=row-1,top=slot*610000+45000,bottom=(slot+1)*610000-45000;
  return {from:`<from xmlns:xdr="${DRAWING_NS}"><xdr:col>${col}</xdr:col><xdr:colOff>60000</xdr:colOff><xdr:row>${rowIndex}</xdr:row><xdr:rowOff>${top}</xdr:rowOff></from>`,to:`<to xmlns:xdr="${DRAWING_NS}"><xdr:col>${col+1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${rowIndex}</xdr:row><xdr:rowOff>${bottom}</xdr:rowOff></to>`,drawingFrom:`<xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>60000</xdr:colOff><xdr:row>${rowIndex}</xdr:row><xdr:rowOff>${top}</xdr:rowOff></xdr:from>`,drawingTo:`<xdr:to><xdr:col>${col+1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${rowIndex}</xdr:row><xdr:rowOff>${bottom}</xdr:rowOff></xdr:to>`,top};
}
function fileBadge(name:string,mime:string){
  const extension=extname(name).slice(1).toUpperCase(),type=extension||mime.split('/').pop()?.toUpperCase()||'FILE';
  if(type==='PDF')return {text:'PDF',color:'#d32f2f'};
  if(['DOC','DOCX'].includes(type))return {text:'DOC',color:'#185abd'};
  if(['XLS','XLSX'].includes(type))return {text:'XLS',color:'#107c41'};
  if(['MP4','MOV','AVI','MKV','WEBM','WMV','M4V'].includes(type))return {text:'VIDEO',color:'#7047eb'};
  if(['PNG','JPG','JPEG','GIF','WEBP','BMP'].includes(type))return {text:'IMG',color:'#0078d4'};
  return {text:type.slice(0,5),color:'#475569'};
}
export function renderAttachmentPreview(file:Pick<OleAttachment,'name'|'mime'|'slot'>){
  const canvas=createCanvas(980,96),context=canvas.getContext('2d'),badge=fileBadge(file.name,file.mime),number=(file.slot||0)+1;
  context.fillStyle='#ffffff';context.fillRect(0,0,980,96);context.strokeStyle='#111827';context.lineWidth=2;context.strokeRect(1,1,978,94);
  context.fillStyle='#f8fafc';context.strokeStyle='#94a3b8';context.lineWidth=2;context.fillRect(32,17,54,62);context.strokeRect(32,17,54,62);
  context.fillStyle=badge.color;context.fillRect(25,45,69,27);context.fillStyle='#ffffff';context.font='bold 15px "Segoe UI", "Microsoft YaHei"';context.textAlign='center';context.textBaseline='middle';context.fillText(badge.text,59,59);
  const prefix=`附件${number}：`,suffix=`“${file.name}”`,start=118;context.textAlign='left';context.font='600 22px "Microsoft YaHei", "Segoe UI"';context.fillStyle='#0f3f83';context.fillText(prefix,start,50);const prefixWidth=context.measureText(prefix).width;
  context.font='22px "Microsoft YaHei", "Segoe UI"';context.fillStyle='#111827';let shown=suffix;while(shown.length>6&&context.measureText(shown).width>820-prefixWidth)shown=`${shown.slice(0,-2)}…”`;context.fillText(shown,start+prefixWidth,50);
  context.fillStyle='#64748b';context.font='16px "Microsoft YaHei", "Segoe UI"';context.fillText('双击打开真实附件',start,75);
  return canvas.toBuffer('image/png');
}
function drawingShape(file:OleAttachment,shapeId:number,imageRelId:string){
  const point=marker(file.column,file.row,file.slot),name=xmlEscape(file.name);
  return `<xdr:twoCellAnchor editAs="oneCell">${point.drawingFrom}${point.drawingTo}<xdr:sp><xdr:nvSpPr><xdr:cNvPr id="${shapeId}" name="${name}"><a:extLst><a:ext uri="{63B3BB69-23CF-44E3-9099-C40C66FF867C}"><a14:compatExt xmlns:a14="${ART_2010_NS}" spid="_x0000_s${shapeId}"/></a:ext></a:extLst></xdr:cNvPr><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="60000" y="${point.top}"/><a:ext cx="4500000" cy="520000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:blipFill><a:blip r:embed="${imageRelId}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`;
}

function worksheetPart(zip:JSZip,sheetName:string){
  const workbook=zip.file('xl/workbook.xml');if(!workbook)throw new Error('XLSX 缺少 workbook.xml。');
  const rels=zip.file('xl/_rels/workbook.xml.rels');if(!rels)throw new Error('XLSX 缺少 workbook 关系文件。');
  return Promise.all([workbook.async('string'),rels.async('string')]).then(([workbookXml,relsXml])=>{
    const sheets=[...workbookXml.matchAll(/<sheet\b[^>]*\bname="([^"]*)"[^>]*\br:id="([^"]+)"[^>]*\/?\s*>/g)];
    const selected=sheets.find(match=>xmlUnescape(match[1])===sheetName);if(!selected)throw new Error(`XLSX 缺少“${sheetName}”工作表。`);
    const rel=[...relsXml.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/?\s*>/g)].find(match=>match[1]===selected[2]);if(!rel)throw new Error(`无法定位“${sheetName}”工作表。`);
    const target=rel[2].replace(/^\//,'');return {path:target.startsWith('xl/')?target:`xl/${target}`,sheetIndex:sheets.indexOf(selected)};
  });
}

export async function injectOleAttachments(workbookBuffer:Buffer,sheetName:string,files:OleAttachment[]){
  if(!files.length)return workbookBuffer;
  const zip=await JSZip.loadAsync(workbookBuffer),sheet=await worksheetPart(zip,sheetName),sheetFile=zip.file(sheet.path);if(!sheetFile)throw new Error(`XLSX 缺少工作表部件 ${sheet.path}。`);
  const sheetXml=await sheetFile.async('string'),fileName=sheet.path.split('/').pop()!,relsPath=`${sheet.path.slice(0,sheet.path.lastIndexOf('/'))}/_rels/${fileName}.rels`,existingRels=zip.file(relsPath),relsXml=existingRels?await existingRels.async('string'):`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}"></Relationships>`;
  if(/<drawing\b/.test(sheetXml))throw new Error('当前导出工作表已包含绘图部件，无法安全追加 OLE 附件。');
  let relationIndex=nextRelationshipId(relsXml),drawingIndex=1;while(zip.file(`xl/drawings/drawing${drawingIndex}.xml`))drawingIndex++;
  const drawingRelId=`rId${relationIndex++}`,sheetRelationships=[relationship(drawingRelId,`${DOC_REL}drawing`,`../drawings/drawing${drawingIndex}.xml`)],drawingRelationships:string[]=[],oleObjects:string[]=[],drawingShapes:string[]=[];
  files.forEach((file,index)=>{
    const oleRelId=`rId${relationIndex++}`,sheetImageRelId=`rId${relationIndex++}`,drawingImageRelId=`rId${index+1}`,shapeId=(sheet.sheetIndex+1)*1024+index+1,point=marker(file.column,file.row,file.slot);
    const imageName=`oleAttachment${index+1}.png`;
    sheetRelationships.push(relationship(oleRelId,`${DOC_REL}oleObject`,`../embeddings/oleObject${index+1}.bin`),relationship(sheetImageRelId,`${DOC_REL}image`,`../media/${imageName}`));
    drawingRelationships.push(relationship(drawingImageRelId,`${DOC_REL}image`,`../media/${imageName}`));
    oleObjects.push(`<oleObject progId="Package" shapeId="${shapeId}" r:id="${oleRelId}"><objectPr defaultSize="0" r:id="${sheetImageRelId}"><anchor moveWithCells="1">${point.from}${point.to}</anchor></objectPr></oleObject>`);
    drawingShapes.push(drawingShape(file,shapeId,drawingImageRelId));
    zip.file(`xl/embeddings/oleObject${index+1}.bin`,createOlePackage(file.name,file.content,index));
    zip.file(`xl/media/${imageName}`,renderAttachmentPreview(file));
  });
  const objectsXml=`<oleObjects>${oleObjects.join('')}</oleObjects>`,updatedSheet=sheetXml.replace('</worksheet>',`<drawing r:id="${drawingRelId}"/>${objectsXml}</worksheet>`);
  zip.file(sheet.path,updatedSheet);zip.file(relsPath,addRelationships(relsXml,sheetRelationships));
  zip.file(`xl/drawings/drawing${drawingIndex}.xml`,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${DRAWING_NS}" xmlns:a="${ART_NS}" xmlns:r="${DOC_REL_NS}">${drawingShapes.join('')}</xdr:wsDr>`);
  zip.file(`xl/drawings/_rels/drawing${drawingIndex}.xml.rels`,`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${REL_NS}">${drawingRelationships.join('')}</Relationships>`);
  const contentFile=zip.file('[Content_Types].xml');if(!contentFile)throw new Error('XLSX 缺少内容类型声明。');let contentXml=await contentFile.async('string');
  if(!/Extension="png"/.test(contentXml))contentXml=contentXml.replace('</Types>','<Default Extension="png" ContentType="image/png"/></Types>');
  files.forEach((_file,index)=>{contentXml=contentXml.replace('</Types>',`<Override PartName="/xl/embeddings/oleObject${index+1}.bin" ContentType="application/vnd.openxmlformats-officedocument.oleObject"/></Types>`);});
  contentXml=contentXml.replace('</Types>',`<Override PartName="/xl/drawings/drawing${drawingIndex}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);zip.file('[Content_Types].xml',contentXml);
  return Buffer.from(await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE',compressionOptions:{level:6}}));
}

function readAsciiZ(buffer:Buffer,state:{offset:number}){const end=buffer.indexOf(0,state.offset);if(end<0)throw new Error('OLE 字符串未终止。');const value=buffer.subarray(state.offset,end).toString('utf8');state.offset=end+1;return value;}
function readUnicodeField(buffer:Buffer,state:{offset:number}){if(state.offset+4>buffer.length)return '';const length=buffer.readUInt32LE(state.offset);state.offset+=4;const bytes=length*2;if(state.offset+bytes>buffer.length)return '';const value=buffer.subarray(state.offset,state.offset+bytes).toString('utf16le');state.offset+=bytes;return value;}
export function extractOlePackage(packageBuffer:Buffer):ExtractedOleAttachment{
  const cfb=CFB.read(packageBuffer,{type:'buffer'}),entry=CFB.find(cfb,'\u0001Ole10Native');if(!entry)throw new Error('OLE 包缺少 Ole10Native 数据流。');const buffer=Buffer.from(entry.content),state={offset:4};
  if(buffer.readUInt16LE(state.offset)!==2)throw new Error('不支持的 OLE Package 格式。');state.offset+=2;const fallback=readAsciiZ(buffer,state);readAsciiZ(buffer,state);state.offset+=4;const commandLength=buffer.readUInt32LE(state.offset);state.offset+=4+commandLength;const dataLength=buffer.readUInt32LE(state.offset);state.offset+=4;const content=Buffer.from(buffer.subarray(state.offset,state.offset+dataLength));state.offset+=dataLength;
  const unicodeCommand=readUnicodeField(buffer,state),unicodeLabel=readUnicodeField(buffer,state);readUnicodeField(buffer,state);return {name:unicodeLabel||unicodeCommand||fallback,content};
}
