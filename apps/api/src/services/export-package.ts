import * as archiveModule from 'archiver';
import type { Archiver } from 'archiver';

export interface ExportPackageFile {sourcePath:string;packagePath:string}

function cleanSegment(value:string,fallback:string){
  const cleaned=value.normalize('NFKC').replace(/[<>:"/\\|?*\p{Cc}]/gu,'_').replace(/[. ]+$/g,'').trim().slice(0,80);
  return cleaned||fallback;
}

export function faqPackagePath(questionIndex:number,question:string,attachmentIndex:number,name:string){
  const folder=`${String(questionIndex).padStart(4,'0')}-${cleanSegment(question,'题目')}`;
  return `真实附件/答疑题库/${folder}/${String(attachmentIndex).padStart(2,'0')}-${cleanSegment(name,'附件')}`;
}

export function ragPackagePath(documentIndex:number,folder:string,name:string){
  return `真实附件/知识库技能/${cleanSegment(folder,'未分类')}/${String(documentIndex).padStart(4,'0')}-${cleanSegment(name,'资料')}`;
}

export function createExportPackage(workbookName:string,workbook:Buffer,files:ExportPackageFile[]):Archiver{
  const compatible=archiveModule as unknown as {ZipArchive?:new(options:object)=>Archiver;default?:(format:string,options:object)=>Archiver};
  const archive=compatible.ZipArchive?new compatible.ZipArchive({zlib:{level:6}}):compatible.default!('zip',{zlib:{level:6}});
  archive.append(workbook,{name:cleanSegment(workbookName,'资料清单.xlsx')});
  for(const file of files)archive.file(file.sourcePath,{name:file.packagePath});
  void archive.finalize();
  return archive;
}

export function createFileArchive(files:ExportPackageFile[]):Archiver{
  const compatible=archiveModule as unknown as {ZipArchive?:new(options:object)=>Archiver;default?:(format:string,options:object)=>Archiver};
  const archive=compatible.ZipArchive?new compatible.ZipArchive({zlib:{level:6}}):compatible.default!('zip',{zlib:{level:6}});
  for(const file of files)archive.file(file.sourcePath,{name:file.packagePath});
  void archive.finalize();
  return archive;
}
