import {test,expect} from '@playwright/test';

test('通知固定 @全体、可选择资料，并可删除群聊',async({page})=>{
  await page.setExtraHTTPHeaders({'X-Forwarded-For':'127.0.0.55'});
  let groups=[{id:'feature-group',label:'功能测试群',groupNumber:'1234567890',nameSynced:true,available:true,enabled:true,firstSeen:Date.now(),lastSeen:Date.now()}];
  await page.route('**/api/v1/admin/qq/groups**',route=>{if(route.request().method()==='DELETE'){groups=[];return route.fulfill({json:{ok:true,id:'feature-group'}});}return route.fulfill({json:{items:groups}});});
  await page.goto('/login');await page.getByLabel('账号').fill('e2e-teacher');await page.getByLabel('口令').fill('test-only-password-123');await page.getByRole('button',{name:'进入工作台'}).click();await page.waitForURL('**/admin');await page.goto('/admin/notifications');
  await page.getByLabel('通知标题').fill('资料通知');await page.getByLabel('通知内容').fill('请查收。');await expect(page.getByText('全体成员',{exact:true})).toBeVisible();
  await page.locator('input[type=file][accept*=".pdf"]').setInputFiles({name:'安排表.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('test')});await expect(page.getByText('安排表.xlsx',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'核对群资料'}).click();await page.getByRole('button',{name:'删除群聊'}).click();const confirm=page.getByRole('dialog').filter({has:page.getByRole('heading',{name:'删除群聊'})});await expect(confirm).toBeVisible();await confirm.getByRole('button',{name:'确认删除'}).click();await expect(page.getByText('群聊已从通知列表删除。')).toBeVisible();await expect(page.getByText('功能测试群',{exact:true})).toHaveCount(0);
});
