import {test,expect} from '@playwright/test';

test('设置中仅保留 QQ 回答开关，两个回答模型严格单选',async({page})=>{
  let qq=false;const calls:string[]=[];
  await page.route('**/api/v1/admin/status',async route=>{const response=await route.fetch(),data=await response.json();await route.fulfill({json:{...data,botCredentialsConfigured:true,botProcessRunning:true,qqAnswerEnabled:qq,botState:'connected'}});});
  for(const enabled of [true,false]){const path=`bot/${enabled?'start':'stop'}`;await page.route(`**/api/v1/admin/${path}`,async route=>{calls.push(path);qq=enabled;await route.fulfill({json:{ok:true}});});}
  const login=await page.request.post('http://127.0.0.1:3101/api/v1/auth/login',{headers:{'X-Forwarded-For':'127.0.0.42'},data:{username:'e2e-teacher',password:'test-only-password-123'}});expect(login.ok()).toBeTruthy();await page.goto('/admin');
  await expect(page.getByRole('navigation').getByRole('link',{name:'开发管理系统'})).toHaveCount(0);
  await page.getByRole('button',{name:'设置',exact:true}).click();const panel=page.getByRole('region',{name:'服务连接'}),control=panel.getByRole('switch',{name:'QQ机器人开关'});
  await expect(control).toBeEnabled();await expect(control).not.toBeChecked();await control.click();await expect(control).toBeChecked();await control.click();await expect(control).not.toBeChecked();expect(calls).toEqual(['bot/start','bot/stop']);
  const picker=page.getByRole('region',{name:'回答模型选择'});await expect(picker.getByRole('radio')).toHaveCount(2);await picker.getByRole('radio',{name:'千源·启智 D1 flash'}).click();await expect(picker.getByRole('radio',{name:'千源·启智 D1 flash'})).toBeChecked();await expect(picker.getByRole('radio',{name:'千源·启智 Z1 flash'})).not.toBeChecked();
  await page.screenshot({path:'qa/screenshots/sidebar-switches.png',fullPage:true});
});
