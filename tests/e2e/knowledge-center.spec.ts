import { test,expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

mkdirSync('qa/screenshots',{recursive:true});

test('知识库三级入口、题库维护与 RAG 工作台可独立打开',async({page})=>{
  await page.goto('/login');
  await page.getByLabel('账号').fill('e2e-teacher');
  await page.getByLabel('口令').fill('test-only-password-123');
  await page.getByRole('button',{name:'进入工作台'}).click();
  await expect(page.getByRole('heading',{name:'工作概览'})).toBeVisible();
  await page.getByRole('link',{name:'知识库',exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/knowledge$/);
  await expect(page.getByRole('link',{name:/答疑题库/})).toBeVisible();
  await expect(page.getByRole('link',{name:/敏感词库/})).toBeVisible();
  await expect(page.getByRole('link',{name:/知识库技能/})).toBeVisible();
  await page.screenshot({path:'qa/screenshots/knowledge-hub.png',fullPage:true,animations:'disabled'});

  await page.getByRole('link',{name:/答疑题库/}).click();
  await expect(page.getByRole('heading',{name:'答疑题库'})).toBeVisible();
  await expect(page.getByRole('link',{name:'返回知识库'})).toBeVisible();
  await expect(page.getByRole('button',{name:'一键导入 Excel'})).toBeVisible();
  await expect(page.getByRole('button',{name:'一键导出 Excel'})).toBeVisible();
  await expect(page.getByLabel('批量修改分类')).toBeVisible();
  await expect(page.getByLabel('批量修改状态')).toBeVisible();
  await expect(page.getByRole('button',{name:'应用修改'})).toBeDisabled();
  await expect(page.getByRole('button',{name:'批量删除'})).toBeDisabled();
  await page.getByRole('button',{name:'管理分类'}).click();
  await expect(page.getByRole('dialog').getByRole('heading',{name:'管理题库分类'})).toBeVisible();
  await page.getByRole('button',{name:'关闭'}).click();
  await page.getByRole('button',{name:'新增条目'}).click();
  const editor=page.getByRole('dialog');
  await expect(editor.getByText('随答案发送的附件')).toBeVisible();
  await expect(editor.locator('input[type="file"]').first()).toHaveAttribute('accept',/video\/\*/);
  await expect(editor.getByText('选择文件',{exact:true})).toBeVisible();
  await expect(editor.getByText('选择文件夹',{exact:true})).toBeVisible();
  await editor.getByRole('button',{name:'关闭'}).click();

  await page.goto('/admin/knowledge/forbidden');
  await expect(page.getByRole('heading',{name:'敏感词库'})).toBeVisible();
  await expect(page.getByRole('link',{name:'返回知识库'})).toBeVisible();
  await expect(page.getByRole('button',{name:'管理分类'})).toBeVisible();
  await expect(page.getByRole('button',{name:'一键导入 Excel'})).toBeVisible();
  await expect(page.getByRole('button',{name:'一键导出 Excel'})).toBeVisible();
  await expect(page.getByRole('button',{name:'导入辱骂词候选'})).toBeVisible();

  await page.goto('/admin/knowledge/skills');
  await expect(page.getByRole('heading',{name:'知识库技能'})).toBeVisible();
  await expect(page.getByRole('link',{name:'返回知识库'})).toBeVisible();
  await expect(page.getByRole('link',{name:'返回知识库'})).toHaveText('');
  await expect(page.getByText('逐份管理 PDF、Word 与 Excel，由 DeepSeek 自动提炼知识图谱；机器人题库未命中时先按关键词定位，再分析生成答案。')).toHaveCount(0);
  await expect(page.getByText('目录结构')).toBeVisible();
  await expect(page.getByText('按 A 到 Z 排列，可滚动查看')).toHaveCount(0);
  await expect(page.getByText('上传进度')).toBeVisible();
  await expect(page.getByRole('button',{name:'一键导出 Excel'})).toBeVisible();
  await expect(page.locator('input[type="file"][multiple]')).toHaveCount(1);
  await expect(page.getByPlaceholder('搜索已上传文件')).toBeVisible();
  await expect(page.getByText('多路召回测试')).toHaveCount(0);
  await expect(page.getByText('RAG 效果评估')).toHaveCount(0);
  await page.getByLabel('新目录名称').fill('测试资料');
  await page.getByRole('button',{name:'新增目录'}).click();
  await expect(page.getByText('测试资料',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'编辑目录 测试资料'}).click();
  const renameDialog=page.getByRole('dialog');
  await renameDialog.getByLabel('目录名称').fill('教学资料');
  await renameDialog.getByRole('button',{name:'保存'}).click();
  await expect(page.getByText('教学资料',{exact:true})).toBeVisible();

  const sign=await page.request.post('http://127.0.0.1:3101/api/v1/auth/login',{data:{username:'e2e-teacher',password:'test-only-password-123'}}),csrf=(await sign.json()).csrfToken;
  for(let index=1;index<=11;index++){
    const upload=await page.request.post('http://127.0.0.1:3101/api/v1/rag/documents',{headers:{'X-CSRF-Token':csrf},multipart:{file:{name:`测试资料-${String(index).padStart(2,'0')}.pdf`,mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')}}});
    expect(upload.status()).toBe(202);
  }
  await page.reload();
  await expect(page.locator('.document-list article')).toHaveCount(10);
  await expect(page.getByText('共 11 条 · 第 1 / 2 页')).toBeVisible();
  await page.getByRole('button',{name:'下一页'}).click();
  await expect(page.locator('.document-list article')).toHaveCount(1);
  await expect(page.getByText('共 11 条 · 第 2 / 2 页')).toBeVisible();
  await page.getByRole('button',{name:'检索配置'}).click();
  await expect(page.getByRole('dialog').getByLabel('向量算法')).toBeVisible();
  await expect(page.getByRole('dialog').getByLabel('混合检索')).toBeVisible();
  await page.screenshot({path:'qa/screenshots/knowledge-skill.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'取消'}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
