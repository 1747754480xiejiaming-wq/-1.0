import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../apps/api/src/db/store.js';
import {QqGroups} from '../apps/api/src/services/qq-groups.js';
import {LocalBotController} from '../apps/api/src/services/bot-control.js';

test('QQ 真实群名同步、群号补录保持；旧机器人群聊不能选用或领取',async t=>{
  const store=new Store(':memory:',process.cwd());t.after(()=>store.close());
  const group=store.registerQqGroup('real_group_BEC507','123456789'),old=store.registerQqGroup('old_group_987654','987654321');
  assert.equal(group.label,'待核对群名');assert.ok(!JSON.stringify(group).includes('BEC507'));
  const folder=mkdtempSync(join(tmpdir(),'campus-group-'));
  writeFileSync(join(folder,'qq-credentials.json'),JSON.stringify({appId:'123456789',appSecret:'test-only-secret'}));
  const urls:string[]=[];const fetcher:typeof fetch=async(url)=>{urls.push(String(url));return new Response(JSON.stringify(String(url).includes('getAppAccessToken')?{access_token:'test-token'}:{group_openid:'real_group_BEC507',group_name:'2026级材料学院学生工作群'}),{status:200});};
  await new QqGroups(store,folder,fetcher).sync();assert.equal(urls.length,2);assert.ok(!urls.some(url=>url.includes('old_group')));
  let row=store.listQqGroups('123456789').find(row=>row.id===group.id)!;assert.equal(row.label,'2026级材料学院学生工作群');assert.equal(row.groupNumber,null);assert.equal(row.nameSynced,true);
  store.updateQqGroup(group.id,{label:'错误别名',groupNumber:'1234567890',enabled:true},'test');
  row=store.listQqGroups('123456789').find(row=>row.id===group.id)!;assert.equal(row.label,'2026级材料学院学生工作群');assert.equal(row.groupNumber,'1234567890');
  assert.equal(store.listQqGroups('123456789').find(row=>row.id===old.id)!.available,false);
  assert.throws(()=>store.updateQqGroup(group.id,{label:'实际群名',groupNumber:'BEC507',enabled:true},'test'),/真实 QQ 群号/);
  const input={requestId:'old-group-request',title:'测试',content:'隔离测试',groupIds:[old.id]};
  assert.throws(()=>store.createNotification(input,'test','123456789'),/不属于当前机器人/);
  store.createNotification(input,'test','987654321');assert.deepEqual(store.claimNotificationTargets(5,'123456789'),[]);
});

test('群资料接口失败时保留已核实名称与群号，不伪造真实群号',async t=>{
  const store=new Store(':memory:',process.cwd());t.after(()=>store.close());const group=store.registerQqGroup('known_group_123456','123456789');store.syncQqGroup(group.id,'123456789','真实工作群');store.updateQqGroup(group.id,{label:'真实工作群',groupNumber:'100012345',enabled:true},'test');
  const folder=mkdtempSync(join(tmpdir(),'campus-group-fail-'));writeFileSync(join(folder,'qq-credentials.json'),JSON.stringify({appId:'123456789',appSecret:'test-secret'}));
  await new QqGroups(store,folder,async()=>new Response('{}',{status:403})).sync();const row=store.listQqGroups()[0];assert.equal(row.label,'真实工作群');assert.equal(row.groupNumber,'100012345');
});

test('机器人更换 AppID 必须更新密钥，原凭证不被覆盖',()=>{
  const folder=mkdtempSync(join(tmpdir(),'campus-bot-switch-')),controller=new LocalBotController(folder,'test-token');controller.save({appId:'123456789',appSecret:'first-test-secret'});
  assert.throws(()=>controller.save({appId:'987654321'}),/必须同时填写/);assert.equal(controller.status().appId,'123456789');
  controller.save({appId:'987654321',appSecret:'second-test-secret'});assert.equal(controller.status().appId,'987654321');
});
