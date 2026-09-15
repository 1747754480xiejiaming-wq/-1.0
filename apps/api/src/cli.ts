import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import Database from 'better-sqlite3';
import { loadConfig } from './config.js';
import { Store } from './db/store.js';
import { hashPassword } from './services/auth.js';
import type { FaqInput } from '@campus/contracts';

const config=loadConfig({logger:false});
const [command,...args]=process.argv.slice(2);
const value=(flag:string)=>{const index=args.indexOf(flag);return index>=0?args[index+1]:undefined;};
const timestamp=()=>new Date().toISOString().replace(/[:.]/g,'-');
type RuntimeSecrets={botToken:string;developerKey:string;developerUsername:string;developerPassword:string;registrationCode:string};
function ensureRuntimeSecrets():RuntimeSecrets {
  mkdirSync(config.localDir,{recursive:true});mkdirSync(config.dataDir,{recursive:true});
  const secretFile=join(config.dataDir,'runtime-secrets.json');
  let stored:Partial<RuntimeSecrets>={};
  if(existsSync(secretFile))stored=JSON.parse(readFileSync(secretFile,'utf8')) as Partial<RuntimeSecrets>;
  const secrets:RuntimeSecrets={
    botToken:stored.botToken||config.botToken||randomBytes(32).toString('base64url'),
    developerKey:stored.developerKey||config.developerKey||randomBytes(24).toString('base64url'),
    developerUsername:stored.developerUsername||config.developerUsername||'developer',
    developerPassword:stored.developerPassword||config.developerPassword||randomBytes(18).toString('base64url'),
    registrationCode:stored.registrationCode||config.registrationCode||randomBytes(12).toString('base64url'),
  };
  writeFileSync(secretFile,JSON.stringify(secrets,null,2),{mode:0o600});
  const infoFile=join(config.localDir,'开发者登录信息.txt');
  writeFileSync(infoFile,`校园教务小助手 · 本机开发者信息\n开发者账号：${secrets.developerUsername}\n开发者口令：${secrets.developerPassword}\n老师注册码：${secrets.registrationCode}\n开发者密匙：${secrets.developerKey}\n\n此文件只保存在本机，已被 Git 忽略。请妥善保管。\n`,{mode:0o600});
  return secrets;
}
function assertStopped() {
  const lock=join(config.dataDir,'api.pid');
  if(existsSync(lock)) {const pid=Number(readFileSync(lock,'utf8'));try{process.kill(pid,0);}catch{return;}throw new Error('请先关闭正在运行的 API 服务，再执行此操作。');}
}
async function main() {
  if(command==='restore') {
    assertStopped(); const source=value('--file');
    if(!source || !args.includes('--confirm')) throw new Error('恢复会替换当前数据库。用 restore --file 备份绝对路径 --confirm 执行；当前数据会先备份。');
    const backupPath=resolve(source);if(backupPath===config.dbPath)throw new Error('备份文件不能是当前数据库。');
    const incoming=new Database(backupPath,{readonly:true,fileMustExist:true});
    try {if(incoming.pragma('integrity_check',{simple:true})!=='ok')throw new Error('备份完整性校验失败。');for(const table of ['faqs','admin_users','sessions','request_dedup','question_daily','model_usage','unmatched_questions','admin_audit'])incoming.prepare(`SELECT count(*) FROM ${table}`).get();}finally{incoming.close();}
    mkdirSync(dirname(config.dbPath),{recursive:true});
    if(existsSync(config.dbPath)){const old=new Store(config.dbPath,config.root);try{mkdirSync(join(config.dataDir,'backups'),{recursive:true});await old.sqlite.backup(join(config.dataDir,'backups',`before-restore-${timestamp()}.db`));old.sqlite.pragma('wal_checkpoint(TRUNCATE)');}finally{old.close();}}
    // These are the two exact SQLite companion files, never a recursive delete.
    for(const suffix of ['-wal','-shm'])if(existsSync(config.dbPath+suffix))unlinkSync(config.dbPath+suffix);
    copyFileSync(backupPath,config.dbPath);const restored=new Store(config.dbPath,config.root);restored.sqlite.exec('DELETE FROM sessions');restored.close();
    console.log('恢复完成，旧会话已失效。原数据库已保留在 backups。');return;
  }
  const store=new Store(config.dbPath,config.root);
  try {
    if(command==='setup' || command==='admin-reset') {
      if(command==='admin-reset')assertStopped();
      ensureRuntimeSecrets();
      if(command==='admin-reset') {
        const username=value('--username')||'teacher';if(!/^[a-zA-Z0-9_-]{3,40}$/.test(username))throw new Error('账号需要 3–40 位字母、数字、下划线或短横线。');
        const password=randomBytes(18).toString('base64url');await store.setAdmin(username,await hashPassword(password));
        const credentialFile=join(config.localDir,'首次登录.txt');
        writeFileSync(credentialFile,`校园教务小助手 · 本机老师登录\n地址：http://127.0.0.1:${process.env.WEB_PORT||8080}/login\n账号：${username}\n口令：${password}\n\n此文件仅存于本机，不加入交付压缩包。请妥善保管。\n重置：npm run admin:reset（先停止 API）\n`,{mode:0o600});
        console.log('老师账号已生成，登录信息保存在 .local/首次登录.txt。');
      } else if(store.adminCount())console.log('已有老师账号，保留原口令。');
      else console.log('尚未注册老师账号，请启动软件后在登录页使用注册码完成注册。');
      if(args.includes('--demo'))console.log(`新增演示 FAQ：${store.seedDemo()} 条。演示内容需要老师核实后才能正式使用。`);
      console.log('初始化完成。');
    } else if(command==='backup') {
      const destination=resolve(value('--file')||join(config.dataDir,'backups',`campus-${timestamp()}.db`));
      if(destination===config.dbPath || existsSync(destination))throw new Error('目标备份文件已存在或指向当前数据库，请使用新文件名。');
      mkdirSync(dirname(destination),{recursive:true});await store.sqlite.backup(destination);console.log(`备份完成：${destination}`);
    } else if(command==='import') {
      const file=value('--file');if(!file)throw new Error('请指定 import --file FAQ.json。');
      const parsed=JSON.parse(readFileSync(resolve(file),'utf8').replace(/^\uFEFF/,'')) as (FaqInput & {id?:string})[];
      if(!Array.isArray(parsed)||parsed.length>5000)throw new Error('导入文件需要为 JSON 数组，最多 5000 条。');
      for(const x of parsed)if(!x || typeof x.question!=='string'||typeof x.answer!=='string'||!Array.isArray(x.keywords)||x.keywords.some(k=>typeof k!=='string'))throw new Error('FAQ 文件格式错误，请参考 docs/faq-import.example.json。');
      const result=store.importFaqs(parsed,'local-import');console.log(`导入 ${result.length} 条，均设为停用，原有 ID 保留。请老师核实后启用。`);
    } else if(command==='export') {
      const destination=resolve(value('--file')||join(config.dataDir,'backups',`faqs-${timestamp()}.json`));if(existsSync(destination))throw new Error('导出目标已存在，请指定新文件名。');
      mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,JSON.stringify(store.listFaqs({pageSize:100000}).items,null,2));console.log(`FAQ 已导出：${destination}`);
    } else throw new Error('支持命令：setup [--demo]、admin-reset、backup、restore、import、export。');
  } finally {store.close();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'操作失败。');process.exitCode=1;});
