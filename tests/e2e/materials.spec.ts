import {test,expect} from '@playwright/test';

test('资料整理显示十条分页、独立滚动、侧栏计数和紧凑品牌标识',async({page})=>{
  await page.route('**/api/v1/admin/status',async route=>{const response=await route.fetch(),data=await response.json();await route.fulfill({json:{...data,pendingQuestions:7,pendingMaterials:16}});});
  await page.goto('/login');await page.getByLabel('账号').fill('e2e-teacher');await page.getByLabel('口令').fill('test-only-password-123');await page.getByRole('button',{name:'进入工作台'}).click();await expect(page.getByRole('heading',{name:'工作概览'})).toBeVisible();
  const category={id:'category-1',name:'教学评价',createdAt:Date.now(),updatedAt:Date.now()};
  await page.route('**/api/v1/admin/materials/categories',route=>route.fulfill({json:{items:[category]}}));
  await page.route(/\/api\/v1\/admin\/materials\?/,route=>route.fulfill({json:{items:Array.from({length:10},(_,index)=>({id:'material-'+index,categoryId:category.id,categoryName:category.name,name:`教学评价资料-${index+1}.pdf`,mime:'application/pdf',size:1024*(index+1),senderId:'student_123456789',senderName:'Irene',status:index<6?'pending_confirm':'archived',createdAt:Date.now()-index*60000,updatedAt:Date.now()})),total:16,page:1,pageSize:10}}));
  await page.getByRole('link',{name:/待解答问题/}).click();const unmatchedHeading=page.getByRole('heading',{name:'待解答问题'});await expect(unmatchedHeading).toBeVisible();expect((await unmatchedHeading.boundingBox())!.height).toBeLessThan(40);
  await page.getByRole('link',{name:'一键通知'}).click();const notificationHeading=page.getByRole('heading',{name:'一键发送通知'});await expect(notificationHeading).toBeVisible();expect((await notificationHeading.boundingBox())!.height).toBeLessThan(40);
  await page.getByRole('link',{name:'资料整理'}).click();await expect(page).toHaveURL(/\/admin\/materials$/);await expect(page.getByRole('heading',{name:'资料整理'})).toBeVisible();await expect(page.locator('.materials-table tbody tr')).toHaveCount(10);await expect(page.getByText(/第 1 \/ 2 页/)).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'学生'})).toHaveCount(0);await expect(page.getByPlaceholder('输入文件名')).toBeVisible();await expect(page.getByText('Irene',{exact:true})).toHaveCount(0);
  const scroll=page.getByRole('region',{name:'资料列表滚动区域'});expect(await scroll.evaluate(element=>element.scrollHeight>element.clientHeight)).toBeTruthy();await scroll.hover();await page.mouse.wheel(0,280);await expect.poll(()=>scroll.evaluate(element=>element.scrollTop)).toBeGreaterThan(0);
  await expect(page.locator('.nav-count')).toHaveCount(2);await expect(page.getByRole('link',{name:/待解答问题/}).locator('.nav-count')).toHaveText('7');await expect(page.getByRole('link',{name:/资料整理/}).locator('.nav-count')).toHaveText('16');
  const logo=page.locator('.brand-company strong');await expect(logo).toHaveText('净千回源科技');expect((await logo.boundingBox())!.width).toBeLessThanOrEqual(132);
  expect((await page.getByRole('heading',{name:'资料整理'}).boundingBox())!.height).toBeLessThan(40);
  await page.screenshot({path:'qa/screenshots/materials-inbox.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
