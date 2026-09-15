import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../apps/api/src/app.js';
import {hashPassword} from '../apps/api/src/services/auth.js';

test('通知 multipart 接口保存附件并允许机器人下载',async t=>{
  const dataDir=mkdtempSync(join(tmpdir(),'campus-notification-files-')),{app,store}=await createApp({dbPath:':memory:',dataDir,logger:false,modelKey:'',botToken:'attachment-bot-token'});t.after(async()=>{await app.close();rmSync(dataDir,{recursive:true,force:true});});
  store.setAdmin('attachment-teacher',await hashPassword('test-password-123'));const group=store.registerQqGroup('multipart_group_123456');
  const sign=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'attachment-teacher',password:'test-password-123'}}),cookie=sign.cookies[0].name+'='+sign.cookies[0].value,csrf=sign.json().csrfToken,boundary='campus-notification-boundary';
  const payload=JSON.stringify({requestId:'multipart-notice-001',title:'资料通知',content:'请查收附件。',groupIds:[group.id]});
  const body=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload"\r\n\r\n${payload}\r\n--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="说明.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-test\r\n--${boundary}--\r\n`);
  const created=await app.inject({method:'POST',url:'/api/v1/admin/notifications',headers:{cookie,'x-csrf-token':csrf,'content-type':`multipart/form-data; boundary=${boundary}`},payload:body});
  assert.equal(created.statusCode,202,created.body);assert.equal(created.json().attachments[0].name,'说明.pdf');
  const attachment=store.claimNotificationTargets()[0].attachments[0];const downloaded=await app.inject({url:'/api/v1/internal/qq/attachments/'+attachment.id,headers:{authorization:'Bearer attachment-bot-token'}});assert.equal(downloaded.statusCode,200);assert.equal(downloaded.body,'%PDF-test');
});

test('群聊删除接口隐藏群聊并取消未开始的通知',async t=>{
  const {app,store}=await createApp({dbPath:':memory:',logger:false,modelKey:'',botToken:'group-delete-token'});t.after(()=>app.close());store.setAdmin('group-teacher',await hashPassword('test-password-123'));const group=store.registerQqGroup('delete_group_api_123456');store.createNotification({requestId:'group-delete-notice-001',title:'待取消',content:'正文',groupIds:[group.id]},'group-teacher');
  const sign=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'group-teacher',password:'test-password-123'}}),headers={cookie:sign.cookies[0].name+'='+sign.cookies[0].value,'x-csrf-token':sign.json().csrfToken};
  assert.equal((await app.inject({method:'DELETE',url:'/api/v1/admin/qq/groups/'+group.id,headers})).statusCode,200);assert.equal((await app.inject({url:'/api/v1/admin/qq/groups',headers})).json().items.length,0);assert.equal(store.listNotifications()[0].failedCount,1);
});
