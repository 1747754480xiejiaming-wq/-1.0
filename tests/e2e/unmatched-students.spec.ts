import {test,expect} from '@playwright/test';

test('待处理问题显示 QQ 昵称和核实号码，不展示 OpenID',async({page})=>{
  const base='http://127.0.0.1:3101/api/v1';
  const botHeaders={Authorization:'Bearer e2e-service-token'};
  const question='学校新生实验服领取流程在哪里查看';
  for(const [requestId,qqSender] of [
    ['e2e-student-source-1',{id:'student_openid_20260001',name:'材料一班小林'}],
    ['e2e-student-source-2',{id:'student_openid_20260001',name:'林同学'}],
    ['e2e-student-source-3',{id:'student_openid_20260002'}],
  ] as const){
    const response=await page.request.post(base+'/internal/qq/answer',{headers:botHeaders,data:{question,requestId,qqSender}});
    expect(response.ok()).toBeTruthy();
  }
  const login=await page.request.post(base+'/auth/login',{headers:{'X-Forwarded-For':'127.0.0.46'},data:{username:'e2e-teacher',password:'test-only-password-123'}});
  expect(login.ok()).toBeTruthy();
  await page.goto('/admin/unmatched');
  const item=page.getByRole('article').filter({hasText:question});
  await expect(item.getByRole('heading',{name:question})).toBeVisible();
  const students=item.getByLabel('咨询学生信息');
  await expect(students).toContainText('林同学');
  await expect(students).toContainText('QQ号待核实');
  await expect(students).not.toContainText('student_openid_20260001');
  await students.locator('.qq-student').filter({hasText:'林同学'}).getByRole('button',{name:'补录QQ号'}).click();
  const dialog=page.getByRole('dialog',{name:'核实学生 QQ 资料'});await dialog.getByLabel('QQ 昵称').fill('Irene');await dialog.getByLabel('QQ号').fill('3556762784');await dialog.getByRole('button',{name:'保存资料'}).click();
  await expect(students).toContainText('Irene');await expect(students).toContainText('QQ号：3556762784');await expect(students).not.toContainText('student_openid_20260001');
  await page.screenshot({path:'qa/screenshots/unmatched-student-info.png',fullPage:true,animations:'disabled'});
});
