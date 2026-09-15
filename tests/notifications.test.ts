import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { Store } from '../apps/api/src/db/store.js';

function enqueue(store:Store){const group=store.registerQqGroup('test_group_123456');store.createNotification({requestId:randomUUID(),title:'测试',content:'隔离测试内容',groupIds:[group.id]},'teacher');return group;}
test('领取超时可恢复，旧凭证不能发送；开始发送后不再自动重发',t=>{
 const store=new Store(':memory:',process.cwd());t.after(()=>store.close());enqueue(store);
 const first=store.claimNotificationTargets()[0];store.sqlite.prepare('UPDATE notification_targets SET lease_until=0').run();
 const second=store.claimNotificationTargets()[0];assert.equal(second.id,first.id);assert.notEqual(second.claimToken,first.claimToken);
 assert.equal(store.beginNotificationTarget(first.id,first.claimToken).canSend,false);
 assert.equal(store.beginNotificationTarget(second.id,second.claimToken).canSend,true);
 assert.equal(store.beginNotificationTarget(second.id,second.claimToken).canSend,false);
 store.sqlite.prepare('UPDATE notification_targets SET lease_until=0').run();assert.deepEqual(store.claimNotificationTargets(),[]);
 assert.match(store.listNotifications()[0].targets[0].lastError!,/未确认/);
 store.completeNotificationTarget(second.id,second.claimToken,'sent');store.completeNotificationTarget(second.id,second.claimToken,'sent');
 assert.equal(store.listNotifications()[0].sentCount,1);assert.deepEqual(store.claimNotificationTargets(),[]);
});
test('停用群聊阻止尚未开始的发送，失败不会重排，非法群选择原子拒绝',t=>{
 const store=new Store(':memory:',process.cwd());t.after(()=>store.close());const group=enqueue(store),item=store.claimNotificationTargets()[0];
 store.updateQqGroup(group.id,{label:'已停用班级',enabled:false},'teacher');assert.equal(store.beginNotificationTarget(item.id,item.claimToken).canSend,false);assert.equal(store.listNotifications()[0].failedCount,1);
 assert.throws(()=>store.createNotification({requestId:randomUUID(),title:'测试',content:'正文',groupIds:[group.id,'missing']},'teacher'));
 assert.equal(store.listNotifications().length,1);store.updateQqGroup(group.id,{label:'班级',enabled:true},'teacher');enqueue(store);
 const active=store.claimNotificationTargets()[0];assert.throws(()=>store.completeNotificationTarget(active.id,active.claimToken,'sent'));
 store.beginNotificationTarget(active.id,active.claimToken);store.completeNotificationTarget(active.id,active.claimToken,'failed');assert.deepEqual(store.claimNotificationTargets(),[]);
});
test('重启后已开始发送的任务不会重放，迁移可重复启动',()=>{
 const db=join(mkdtempSync(join(tmpdir(),'campus-queue-')),'campus.db');let store=new Store(db,process.cwd());enqueue(store);const item=store.claimNotificationTargets()[0];store.beginNotificationTarget(item.id,item.claimToken);store.close();
 store=new Store(db,process.cwd());try{store.sqlite.prepare('UPDATE notification_targets SET lease_until=0').run();assert.deepEqual(store.claimNotificationTargets(),[]);assert.equal(store.listNotifications()[0].failedCount,1);assert.equal(store.sqlite.pragma('integrity_check',{simple:true}),'ok');}finally{store.close();}
});
test('通知附件随队列返回，群聊删除后不再可选且保留历史',t=>{
 const store=new Store(':memory:',process.cwd());t.after(()=>store.close());const group=store.registerQqGroup('attachment_group_123456');
 const record=store.createNotification({requestId:'attachment-notice-001',title:'资料通知',content:'请查收',groupIds:[group.id]},'teacher',undefined,[{name:'说明.pdf',storedName:'stored-test.pdf',kind:'pdf',mime:'application/pdf',size:16}]);
 assert.equal(record.attachments[0].name,'说明.pdf');assert.equal(store.claimNotificationTargets()[0].attachments[0].kind,'pdf');
 store.deleteQqGroup(group.id,'teacher');assert.equal(store.listQqGroups().length,0);assert.equal(store.listNotifications()[0].targets[0].groupLabel,'待核对群名');
 assert.throws(()=>store.createNotification({requestId:'attachment-notice-002',title:'再次通知',content:'正文',groupIds:[group.id]},'teacher'),{code:'INVALID_GROUP_SELECTION'});
});
