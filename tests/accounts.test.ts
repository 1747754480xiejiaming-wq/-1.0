import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../apps/api/src/app.js';

const root=process.cwd();
const cookieHeader=(response:{cookies:{name:string;value:string}[]})=>response.cookies[0].name+'='+response.cookies[0].value;

test('注册码注册、开发者找回入口和跨账号知识数据隔离',async t=>{
  const {app}=await createApp({root,dbPath:':memory:',logger:false,modelKey:'',botToken:'account-test-token',developerKey:'test-developer-key-123',developerUsername:'test-developer',developerPassword:'test-developer-password-123',registrationCode:'test-registration-code'});t.after(()=>app.close());
  assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/register',payload:{username:'学院甲老师',password:'teacher-password-123',registrationCode:'wrong'}})).statusCode,403);
  const first=await app.inject({method:'POST',url:'/api/v1/auth/register',payload:{username:'学院甲老师',password:'teacher-password-123',registrationCode:'test-registration-code'}});assert.equal(first.statusCode,201);assert.equal(first.json().user.role,'teacher');
  const firstHeaders={cookie:cookieHeader(first),'x-csrf-token':first.json().csrfToken};
  assert.equal((await app.inject({url:'/api/v1/knowledge/categories?libraryType=answer',headers:firstHeaders})).json().items.length,5);
  assert.equal((await app.inject({method:'POST',url:'/api/v1/faqs',headers:firstHeaders,payload:{question:'甲学院专属教务问题',answer:'甲学院答案',keywords:['甲学院'],category:'校园服务',status:'active',confirmed:true,libraryType:'answer'}})).statusCode,201);

  const second=await app.inject({method:'POST',url:'/api/v1/auth/register',payload:{username:'学院乙老师',password:'teacher-password-456',registrationCode:'test-registration-code'}});assert.equal(second.statusCode,201);const secondHeaders={cookie:cookieHeader(second),'x-csrf-token':second.json().csrfToken};
  assert.equal((await app.inject({url:'/api/v1/faqs?libraryType=answer',headers:secondHeaders})).json().total,0);
  assert.equal((await app.inject({url:'/api/v1/faqs?libraryType=answer',headers:firstHeaders})).json().total,1);

  const developer=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'test-developer',password:'test-developer-password-123'}});assert.equal(developer.statusCode,200);assert.equal(developer.json().user.role,'developer');const developerHeaders={cookie:cookieHeader(developer),'x-csrf-token':developer.json().csrfToken};
  assert.equal((await app.inject({url:'/api/v1/faqs',headers:developerHeaders})).statusCode,403);
  const accounts=(await app.inject({url:'/api/v1/developer/accounts',headers:developerHeaders})).json().items;assert.deepEqual(accounts.map((item:{username:string})=>item.username).sort(),['学院乙老师','学院甲老师']);
  const target=accounts.find((item:{username:string})=>item.username==='学院甲老师');assert.equal((await app.inject({method:'POST',url:`/api/v1/developer/accounts/${target.id}/reset-password`,headers:developerHeaders,payload:{password:'new-teacher-password-789'}})).statusCode,200);
  assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'学院甲老师',password:'teacher-password-123'}})).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'学院甲老师',password:'new-teacher-password-789'}})).statusCode,200);
});
