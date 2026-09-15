import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../apps/api/src/db/store.js';
import {createApp} from '../apps/api/src/app.js';
import {hashPassword} from '../apps/api/src/services/auth.js';

test('删除完成记录后隐藏且重启不恢复，保留去重凭据阻止旧请求重发',()=>{
  const path=join(mkdtempSync(join(tmpdir(),'campus-history-')),'test.db');let store=new Store(path,process.cwd());
  const group=store.registerQqGroup('delete_test_group_01'),input={requestId:'delete-test-request-001',title:'可删除通知',content:'测试通知正文',groupIds:[group.id]},record=store.createNotification(input,'tester');
  const target=store.claimNotificationTargets()[0];store.beginNotificationTarget(target.id,target.claimToken);store.completeNotificationTarget(target.id,target.claimToken,'sent',undefined,'qq-test-receipt');
  assert.deepEqual(store.deleteNotification(record.id,'tester'),{ok:true,id:record.id});assert.deepEqual(store.deleteNotification(record.id,'tester'),{ok:true,id:record.id});assert.equal(store.listNotifications().length,0);
  assert.throws(()=>store.createNotification(input,'tester'),{code:'NOTIFICATION_DELETED'});assert.equal((store.sqlite.prepare("SELECT count(*) AS n FROM admin_audit WHERE action='notification.delete'").get() as {n:number}).n,1);
  assert.equal((store.sqlite.prepare('SELECT platform_message_id FROM notification_targets WHERE id=?').get(target.id) as {platform_message_id:string}).platform_message_id,'qq-test-receipt');store.close();store=new Store(path,process.cwd());
  try{assert.equal(store.listNotifications().length,0);assert.deepEqual(store.claimNotificationTargets(),[]);assert.throws(()=>store.createNotification(input,'tester'),{code:'NOTIFICATION_DELETED'});}finally{store.close();}
});

test('排队和发送中的记录不能删除，失败结束后可以删除且不影响其他通知',()=>{
  const store=new Store(':memory:',process.cwd());try{
    const group=store.registerQqGroup('delete_test_group_02'),record=store.createNotification({requestId:'delete-test-request-002',title:'发送中的通知',content:'测试通知正文',groupIds:[group.id]},'tester');
    assert.throws(()=>store.deleteNotification(record.id,'tester'),{code:'NOTIFICATION_ACTIVE'});const target=store.claimNotificationTargets()[0];assert.throws(()=>store.deleteNotification(record.id,'tester'),{code:'NOTIFICATION_ACTIVE'});store.beginNotificationTarget(target.id,target.claimToken);assert.throws(()=>store.deleteNotification(record.id,'tester'),{code:'NOTIFICATION_ACTIVE'});
    const other=store.createNotification({requestId:'delete-test-request-003',title:'另一条通知',content:'保留正文',groupIds:[group.id]},'tester');store.completeNotificationTarget(target.id,target.claimToken,'failed','测试失败');store.deleteNotification(record.id,'tester');assert.deepEqual(store.listNotifications().map(x=>x.id),[other.id]);assert.throws(()=>store.deleteNotification('unknown','tester'),{code:'NOT_FOUND'});
  }finally{store.close();}
});

test('发送记录删除接口验证登录、CSRF、来源以及分离前端的 DELETE 预检',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'campus-delete-api-')),{app,store}=await createApp({dbPath:':memory:',dataDir:dir,localDir:dir,logger:false,modelKey:''});t.after(()=>app.close());store.setAdmin('delete-teacher',await hashPassword('delete-test-password'));
  const group=store.registerQqGroup('delete_test_group_03'),record=store.createNotification({requestId:'delete-test-request-004',title:'接口测试',content:'测试正文',groupIds:[group.id]},'tester'),target=store.claimNotificationTargets()[0];store.beginNotificationTarget(target.id,target.claimToken);store.completeNotificationTarget(target.id,target.claimToken,'failed','测试失败');
  const url='/api/v1/admin/notifications/'+record.id;assert.equal((await app.inject({method:'DELETE',url})).statusCode,401);
  const sign=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'delete-teacher',password:'delete-test-password'}}),cookie=sign.cookies[0].name+'='+sign.cookies[0].value,headers={cookie,'x-csrf-token':sign.json().csrfToken};
  assert.equal((await app.inject({method:'DELETE',url,headers:{cookie}})).statusCode,403);assert.equal((await app.inject({method:'DELETE',url,headers:{...headers,origin:'https://untrusted.example'}})).statusCode,403);assert.equal(store.listNotifications().length,1);
  const preflight=await app.inject({method:'OPTIONS',url,headers:{origin:'http://127.0.0.1:8080','access-control-request-method':'DELETE','access-control-request-headers':'x-csrf-token'}});assert.match(String(preflight.headers['access-control-allow-methods']),/DELETE/);
  assert.equal((await app.inject({method:'DELETE',url,headers})).statusCode,200);assert.equal((await app.inject({method:'DELETE',url,headers})).statusCode,200);assert.equal((await app.inject({url:'/api/v1/admin/notifications',headers})).json().items.length,0);
});
