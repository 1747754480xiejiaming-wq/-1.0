import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,existsSync,readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import Database from 'better-sqlite3';
test('CLI 初始化、保留口令、备份恢复和导入的完整操作',()=>{
  const root=mkdtempSync(join(tmpdir(),'campus-cli-'));mkdirSync(join(root,'migrations'));for(const file of readdirSync('migrations').filter(name=>name.endsWith('.sql')))copyFileSync(join('migrations',file),join(root,'migrations',file));
  const env={...process.env,CAMPUS_ROOT:root,DATABASE_PATH:'data/campus.db',DEEPSEEK_API_KEY:''};
  const run=(...args:string[])=>{const result=spawnSync(process.execPath,['--import','tsx','apps/api/src/cli.ts',...args],{env,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);return result;};
  run('setup','--demo');const credentialPath=join(root,'.local/首次登录.txt');assert.equal(existsSync(credentialPath),false);run('setup','--demo');assert.equal(existsSync(credentialPath),false);
  const file=join(root,'backup.db');run('backup','--file',file);let db=new Database(join(root,'data/campus.db'));db.prepare('UPDATE faqs SET answer=?').run('修改后的内容');db.close();run('restore','--file',file,'--confirm');db=new Database(join(root,'data/campus.db'));assert.notEqual((db.prepare('SELECT answer FROM faqs LIMIT 1').get() as {answer:string}).answer,'修改后的内容');assert.equal(db.pragma('integrity_check',{simple:true}),'ok');db.close();
  const data=join(root,'faq.json');writeFileSync(data,JSON.stringify([{id:'legacy-stable',question:'校外实习如何备案？',answer:'联系学院实习老师。',keywords:['实习备案'],category:'校园服务'}]));run('import','--file',data);db=new Database(join(root,'data/campus.db'));assert.equal((db.prepare('SELECT status FROM faqs WHERE id=?').get('legacy-stable') as {status:string}).status,'disabled');db.close();
  run('admin-reset');assert.ok(existsSync(credentialPath));assert.match(readFileSync(credentialPath,'utf8'),/账号：teacher/);
});
