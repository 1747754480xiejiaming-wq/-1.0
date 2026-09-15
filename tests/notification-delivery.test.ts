import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {deliverNotification,notificationFailure} from '../apps/qq-bot/src/notifications.js';
import {completeNotification,shouldRecallForbidden} from '../apps/qq-bot/src/transport.js';
import {Store} from '../apps/api/src/db/store.js';

test('主动群消息权限拒绝单独识别，未知网络结果不误报成功且不重发',async()=>{
  const item={id:'target',notificationId:'notice',groupOpenId:'test_group_123',text:'通知正文',claimToken:randomUUID()};let calls=0;
  const denied=await deliverNotification(item,async()=>{calls++;throw {httpStatus:400,bizCode:40034105,message:'API Error with private-token and group-id'};});assert.equal(calls,1);assert.equal(denied.status,'failed');assert.match(denied.errorCode!,/主动群消息权限（40034105）/);assert.ok(!JSON.stringify(denied).includes('private-token'));
  const timeout=await deliverNotification(item,async()=>{calls++;throw {httpStatus:0,message:'timeout'};});assert.equal(calls,2);assert.match(timeout.errorCode!,/未确认/);
  const noReceipt=await deliverNotification(item,async()=>({}));assert.equal(noReceipt.status,'failed');assert.match(noReceipt.errorCode!,/未确认/);
  assert.match(notificationFailure({httpStatus:429}).errorCode!,/频率或额度/);assert.match(notificationFailure({httpStatus:401}).errorCode!,/凭证/);
});
test('成功回执 ID 和具体失败原因贯穿机器人回写与数据库',async t=>{
  const store=new Store(':memory:',process.cwd());t.after(()=>store.close());
  const group=store.registerQqGroup('test_group_654321');
  for(const status of ['sent','failed'] as const){
    store.createNotification({requestId:randomUUID(),title:'选课通知',content:'选课截至时间为9月9号，还没选课的同学尽快了',groupIds:[group.id]},'teacher');
    const item=store.claimNotificationTargets()[0];store.beginNotificationTarget(item.id,item.claimToken);
    const result=await deliverNotification(item,async(target,text)=>{assert.equal(target.targetId,'test_group_654321');assert.ok(text.startsWith('@全体成员\n'));assert.ok(text.includes('9月9号'));if(status==='failed')throw {httpStatus:400,bizCode:40034105};return {id:'QQ-platform-receipt_123'};});
    await completeNotification('http://127.0.0.1:3001','local-token',item.id,item.claimToken,result.status,async(_url,init)=>{const body=JSON.parse(String(init?.body));store.completeNotificationTarget(item.id,body.claimToken,body.status,body.errorCode,body.messageId);return Response.json({ok:true});},result);
    const record=store.listNotifications().find(record=>record.id===item.notificationId)!;assert.equal(record.targets[0].status,status);assert.equal(record.targets[0].messageId,status==='sent'?'QQ-platform-receipt_123':null);if(status==='failed')assert.match(record.targets[0].lastError!,/40034105/);
  }
  assert.deepEqual(store.claimNotificationTargets(),[]);
});

test('通知正文后按顺序发送附件',async()=>{
  const item={id:'target-with-files',notificationId:'notice-with-files',groupOpenId:'test_group_files',text:'请查收资料',claimToken:randomUUID(),attachments:[{id:'file-1',notificationId:'notice-with-files',name:'安排表.xlsx',kind:'excel' as const,mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',size:8,createdAt:1}]};
  const calls:string[]=[];const result=await deliverNotification(item,async(_target,text)=>{calls.push(text);return {id:'receipt-files'};},async(_target,attachment)=>{calls.push(attachment.name);});
  assert.equal(result.status,'sent');assert.deepEqual(calls,['@全体成员\n请查收资料','安排表.xlsx']);
});

test('只有群聊中的敏感词库命中需要撤回原提问',()=>{
  assert.equal(shouldRecallForbidden('forbidden_keyword','group'),true);assert.equal(shouldRecallForbidden('forbidden_semantic','group'),true);assert.equal(shouldRecallForbidden('faq_keyword','group'),false);assert.equal(shouldRecallForbidden('forbidden_keyword','c2c'),false);
});
