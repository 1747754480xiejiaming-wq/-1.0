import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const {provisionModels}=createRequire(import.meta.url)('../desktop/model-bootstrap.cjs');
test('双模型安装配置支持全新安装、补齐旧版智谱并保留已有配置',()=>{
 const dir=mkdtempSync(join(tmpdir(),'campus-bootstrap-test-'));
 try{
  const seed=join(dir,'bootstrap.json'),dest=join(dir,'data','model-connections.json');
  writeFileSync(seed,JSON.stringify({providers:{deepseek:{apiKey:'test-deepseek-key'},zhipu:{apiKey:'test-zhipu-key'}}}));
  assert.equal(provisionModels(seed,dest),true);
  const fresh=JSON.parse(readFileSync(dest,'utf8'));
  assert.equal(fresh.providers.zhipu.apiKey,'test-zhipu-key');
  assert.equal(fresh.providers.zhipu.connected,false);
  assert.equal(existsSync(seed),true);
  fresh.activeTextProvider='zhipu';fresh.providers.deepseek={apiKey:'existing-user-key',connected:true,checkedAt:123};delete fresh.providers.zhipu;
  writeFileSync(dest,JSON.stringify(fresh));provisionModels(seed,dest);
  const migrated=JSON.parse(readFileSync(dest,'utf8'));
  assert.equal(migrated.activeTextProvider,'zhipu');assert.deepEqual(migrated.providers.deepseek,fresh.providers.deepseek);
  assert.equal(migrated.providers.zhipu.apiKey,'test-zhipu-key');assert.equal(provisionModels(seed,dest),false);
  const secondUser=join(dir,'second-user','model-connections.json');assert.equal(provisionModels(seed,secondUser),true);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
