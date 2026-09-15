import { ZipArchive } from 'archiver';
import {createHash} from 'node:crypto';
import {createWriteStream,mkdirSync,readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),source=join(root,'快捷启动命令包'),release=join(root,'release');
mkdirSync(release,{recursive:true});const outputPath=join(release,'校园教务小助手-快捷启动命令包.zip'),output=createWriteStream(outputPath),archive=new ZipArchive({zlib:{level:9}});
const completed=new Promise((resolve,reject)=>{output.on('close',resolve);output.on('error',reject);archive.on('error',reject);});archive.pipe(output);
const manifest=[];for(const item of readdirSync(source,{withFileTypes:true})){if(!item.isFile())continue;const path=join(source,item.name),data=readFileSync(path);manifest.push({path:item.name,size:data.length,sha256:createHash('sha256').update(data).digest('hex')});archive.file(path,{name:`校园教务小助手-快捷启动命令包/${item.name}`});}
archive.append(JSON.stringify(manifest,null,2),{name:'校园教务小助手-快捷启动命令包/PACKAGE-MANIFEST.json'});await archive.finalize();await completed;
const hash=createHash('sha256').update(readFileSync(outputPath)).digest('hex');writeFileSync(outputPath+'.sha256',`${hash}  校园教务小助手-快捷启动命令包.zip\n`);console.log(`快捷启动命令包：${outputPath}（${statSync(outputPath).size} 字节）`);
