import * as archiveModule from 'archiver';
import { createWriteStream,mkdirSync,rmSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MultipartFile } from '@fastify/multipart';
import type { KnowledgeAttachmentKind } from '@campus/contracts';
import { AppError } from '../errors.js';

export const safeName=(value:string)=>value.replace(/\\/g,'/').split('/').filter(x=>x&&x!=='.'&&x!=='..').map(x=>x.replace(/[<>:"|?*\p{Cc}]/gu,'_').slice(0,100)).join('/').slice(0,240)||'未命名文件';
export async function partBuffer(part:MultipartFile,max=25*1024*1024){const chunks:Buffer[]=[];let size=0;for await(const chunk of part.file){size+=chunk.length;if(size>max)throw new AppError(413,'FILE_TOO_LARGE','单个文件不能超过 25 MB。');chunks.push(chunk);}return Buffer.concat(chunks);}
export function attachmentKind(name:string,mime:string):Exclude<KnowledgeAttachmentKind,'folder'>{const ext=name.toLowerCase().split('.').pop();if(mime.startsWith('video/')||['mp4','mov','avi','mkv','webm','wmv','m4v'].includes(ext||''))return'video';if(mime.startsWith('image/')||['png','jpg','jpeg','gif','webp','bmp'].includes(ext||''))return'image';if(ext==='pdf')return'pdf';if(['doc','docx'].includes(ext||''))return'word';if(['xls','xlsx'].includes(ext||''))return'excel';throw new AppError(400,'UNSUPPORTED_ATTACHMENT','附件仅支持视频、图片、PDF、Word、Excel 或文件夹。');}
export const notificationAttachmentKind=attachmentKind;
export function saveBuffer(directory:string,buffer:Buffer,extension='bin'){mkdirSync(directory,{recursive:true});const stored=`${randomUUID()}.${extension.replace(/[^a-z0-9]/gi,'').slice(0,8)||'bin'}`;writeFileSync(join(directory,stored),buffer,{flag:'wx'});return stored;}
export async function saveFolderZip(directory:string,files:{name:string;buffer:Buffer}[]){if(!files.length)throw new AppError(400,'EMPTY_FOLDER','选择的文件夹中没有可上传文件。');mkdirSync(directory,{recursive:true});const stored=`${randomUUID()}.zip`,path=join(directory,stored);await new Promise<void>((resolve,reject)=>{const output=createWriteStream(path,{flags:'wx'});const compatible=archiveModule as unknown as {ZipArchive?:new(options:object)=>archiveModule.Archiver;default?:(format:string,options:object)=>archiveModule.Archiver};const zip=compatible.ZipArchive?new compatible.ZipArchive({zlib:{level:6}}):compatible.default!('zip',{zlib:{level:6}});output.on('close',resolve);output.on('error',reject);zip.on('error',reject);zip.pipe(output);for(const file of files)zip.append(file.buffer,{name:safeName(file.name)});void zip.finalize();}).catch(error=>{rmSync(path,{force:true});throw error;});return {stored,size:(await import('node:fs')).statSync(path).size};}
