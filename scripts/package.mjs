import { ZipArchive } from 'archiver';
import { createWriteStream,mkdirSync,readdirSync,statSync,readFileSync,writeFileSync } from 'node:fs';
import { dirname,resolve,join,relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),release=join(root,'release');mkdirSync(release,{recursive:true});
const version=JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version;
const archiveName=`campus-secretary-mvp-${version}.zip`,outputPath=join(release,archiveName),output=createWriteStream(outputPath),archive=new ZipArchive({zlib:{level:9}});
const done=new Promise((resolve,reject)=>{output.on('close',resolve);output.on('error',reject);archive.on('error',reject);});archive.pipe(output);
const excluded=new Set(['node_modules','data','.local','backups','release','qa','tmp','test-results','playwright-report','你的路径','.git','.env','.env.local']);
const manifest=[];
function add(directory){for(const item of readdirSync(directory,{withFileTypes:true})){if(excluded.has(item.name)||item.name.endsWith('.log')||item.isSymbolicLink())continue;const path=join(directory,item.name),name=relative(root,path).replaceAll('\\','/');if(name==='desktop/runtime'||name.startsWith('desktop/runtime/')||name==='docs/test-results'||name.startsWith('docs/test-results/'))continue;if(item.isDirectory())add(path);else{archive.file(path,{name:`campus-secretary-mvp/${name}`});manifest.push({path:name,size:statSync(path).size,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')});}}}
add(root);archive.append(JSON.stringify(manifest,null,2),{name:'campus-secretary-mvp/PACKAGE-MANIFEST.json'});await archive.finalize();await done;
const sum=createHash('sha256').update(readFileSync(outputPath)).digest('hex');writeFileSync(outputPath+'.sha256',`${sum}  ${archiveName}\n`);console.log(`已打包 ${manifest.length} 个文件，${(statSync(outputPath).size/1024/1024).toFixed(2)} MB：${outputPath}`);
