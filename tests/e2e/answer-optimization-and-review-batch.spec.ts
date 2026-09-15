import { test,expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
mkdirSync('qa/screenshots',{recursive:true});

test('标准答案智能优化、待解答批量操作和左上角文字品牌',async({page})=>{
  await page.setExtraHTTPHeaders({'X-Forwarded-For':'127.0.0.61'});
  await page.goto('/login');
  await page.getByLabel('账号').fill('e2e-teacher');
  await page.getByLabel('口令').fill('test-only-password-123');
  await page.getByRole('button',{name:'进入工作台'}).click();
  await expect(page.getByRole('heading',{name:'工作概览'})).toBeVisible();
  await expect(page.locator('.brand-mark')).toBeVisible();
  await expect(page.locator('.brand-company')).toContainText('净千回源科技');
  await expect(page.locator('.sidebar-company-logo')).toHaveCount(0);

  await page.route('**/api/v1/faqs/optimize-answer',async route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({answer:'第一步，提交申请。\n第二步，等待审核。'})}));
  await page.goto('/admin/knowledge/questions');
  await page.getByRole('row').nth(1).getByRole('button',{name:'编辑'}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('button',{name:'智能优化'})).toBeEnabled();
  await dialog.getByRole('button',{name:'智能优化'}).click();
  await expect(dialog.getByLabel('标准答案')).toHaveValue('第一步，提交申请。\n第二步，等待审核。');
  await expect(dialog.getByText('标准答案已优化，请核实内容后再保存。')).toBeVisible();
  await page.screenshot({path:'qa/screenshots/answer-smart-optimize.png',animations:'disabled'});
  await dialog.getByLabel('关闭').click();

  for(const [index,question] of ['离线待办问题甲','离线待办问题乙'].entries()){
    const response=await page.request.post('/api/v1/internal/qq/offline/questions',{headers:{authorization:'Bearer e2e-service-token'},data:{question,qqSender:{id:`batch_sender_${index}`,name:`学生${index+1}`}}});
    expect(response.ok()).toBeTruthy();
  }
  await page.goto('/admin/unmatched');
  await page.getByRole('tab',{name:'未答问题'}).click();
  for(const question of ['离线待办问题甲','离线待办问题乙'])await page.getByLabel(`选择 ${question}`).check();
  await expect(page.getByRole('article').first().getByRole('button',{name:'删除'})).toBeVisible();
  await expect(page.getByRole('button',{name:'批量忽略'})).toBeEnabled();
  await page.screenshot({path:'qa/screenshots/unmatched-batch-actions.png',animations:'disabled'});
  await page.getByRole('button',{name:'批量忽略'}).click();
  await page.getByRole('button',{name:'确认忽略'}).click();
  await expect(page.getByText('已忽略 2 条问题。')).toBeVisible();
  await page.getByLabel('处理状态').selectOption('ignored');
  await expect(page.getByRole('article')).toHaveCount(2);
  await page.getByText('选择本页').click();
  await page.getByRole('button',{name:'批量删除'}).click();
  await page.getByRole('button',{name:'确认删除'}).click();
  await expect(page.getByText('已删除 2 条问题记录。')).toBeVisible();
  await expect(page.getByText('未答问题中暂时没有问题')).toBeVisible();
});
