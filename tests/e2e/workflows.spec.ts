import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
mkdirSync("qa/screenshots", { recursive: true });
let loginIp = 50;
async function login(page: Page) {
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": `127.0.0.${loginIp++}` });
  await page.goto("/login");
  await page.getByLabel("账号").fill("e2e-teacher");
  await page.getByLabel("口令").fill("test-only-password-123");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await expect(page.getByRole("heading", { name: "工作概览" })).toBeVisible();
}
async function unlockSettings(page: Page) {
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "开发者验证" })).toBeVisible();
  await page.getByLabel("开发者密匙").fill("test-developer-key-123");
  await page.getByRole("button", { name: "验证并查看" }).click();
  await expect(page.getByRole("region", { name: "千源·启智 D1 flash模型" })).toBeVisible();
}
test("教师专用入口与白底水墨主题", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "登录工作台" })).toBeVisible();
  await expect(page.getByText("返回学生端", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "你的教务问题" })).toHaveCount(
    0,
  );
  await expect(page.locator(".theme-root")).toHaveClass(/ink-study/);
  await expect(page.locator(".theme-root")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "qa/screenshots/teacher-login-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
test("老师登录、知识库新增编辑停用、未命中补充、状态查看", async ({ page }) => {
  await page.goto("/admin/questions");
  await expect(page.getByRole("heading", { name: "登录工作台" })).toBeVisible();
  await page.screenshot({
    path: "qa/screenshots/login.png",
    fullPage: true,
    animations: "disabled",
  });
  await login(page);
  await page.screenshot({
    path: "qa/screenshots/dashboard.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: "知识库", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "知识库", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "qa/screenshots/knowledge.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("link", { name: /答疑题库/ }).click();
  await page.getByRole("button", { name: "新增条目", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("标准问题").fill("如何申请实验室参观？");
  await dialog
    .getByLabel("标准答案")
    .fill("联系实验室管理老师提交参观申请，按审核安排到场。");
  await dialog.getByLabel("匹配关键词").fill("实验室参观，参观申请");
  await dialog.getByLabel("公开状态").selectOption("active");
  await expect(dialog.getByRole("button", { name: "保存条目" })).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await page.screenshot({
    path: "qa/screenshots/faq-editor.png",
    fullPage: false,
    animations: "disabled",
  });
  await dialog.getByRole("button", { name: "保存条目" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("搜索题库").fill("实验室参观");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  const faqRow = page
    .getByRole("row")
    .filter({ hasText: "如何申请实验室参观？" });
  await expect(faqRow).toBeVisible();
  await faqRow.getByRole("button", { name: "编辑" }).click();
  await dialog.getByLabel("标准答案").fill("更新后的参观办理流程。");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "保存条目" }).click();
  await expect(dialog).not.toBeVisible();
  const session = await (await page.request.get("/api/v1/auth/session")).json(),
    headers = { "X-CSRF-Token": session.csrfToken };
  const answer = await page.request.post("/api/v1/admin/answer/test", {
    headers,
    data: { question: "如何申请实验室参观？", requestId: crypto.randomUUID() },
  });
  expect((await answer.json()).answer).toBe("更新后的参观办理流程。");
  await page.request.post("/api/v1/admin/answer/test", {
    headers,
    data: {
      question: "学校可以办理校外实习备案吗",
      requestId: crypto.randomUUID(),
    },
  });
  await page.goto("/admin/unmatched");
  await expect(
    page.getByRole("heading", { name: "学校可以办理校外实习备案吗" }),
  ).toBeVisible();
  await page.screenshot({
    path: "qa/screenshots/unmatched.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("article")
    .filter({ hasText: "学校可以办理校外实习备案吗" })
    .getByRole("button", { name: "补充解答" })
    .click();
  await dialog.getByLabel("标准答案").fill("请咨询学院实习负责老师。");
  await dialog.getByLabel("匹配关键词").fill("实习备案");
  await dialog.getByRole("button", { name: "保存条目" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "学校可以办理校外实习备案吗" }),
  ).not.toBeVisible();
  await page.goto("/admin/questions");
  await page.getByLabel("搜索题库").fill("实验室参观");
  await page.getByRole("button", { name: "查询", exact: true }).click();
  const savedRow = page
    .getByRole("row")
    .filter({ hasText: "如何申请实验室参观？" });
  await savedRow.getByRole("button", { name: "编辑" }).click();
  await dialog.getByLabel("公开状态").selectOption("disabled");
  await dialog.getByRole("button", { name: "保存条目" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(savedRow.getByText("已停用")).toBeVisible();
  await page.goto("/admin/notifications");
  await expect(
    page.getByRole("heading", { name: "一键发送通知" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "核对群资料" }).click();
  const firstGroup = page.getByRole("form", {
    name: "2026级1班工作群的群资料",
  });
  await expect(
    firstGroup.getByLabel("2026级1班工作群 群聊名称"),
  ).toHaveAttribute("readonly", "");
  await firstGroup.getByLabel("2026级1班工作群 QQ 群号").fill("1234567890");
  await firstGroup.getByRole("button", { name: "保存群资料" }).click();
  await expect(firstGroup.getByRole("status")).toHaveText("群资料已保存");
  await page.getByRole("button", { name: "关闭群资料" }).click();
  await page.getByRole("combobox", { name: "选择通知群聊" }).click();
  await page.getByRole("menuitemcheckbox", { name: /2026级1班工作群/ }).click();
  await page.getByRole("menuitemcheckbox", { name: /2026级2班工作群/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("已选通知群聊")).toContainText("1234567890");
  await page.getByLabel("通知标题").fill("选课提醒");
  await page
    .getByLabel("通知内容")
    .fill("请在本周五前完成选课，并核对个人课表。");
  await page.getByRole("button", { name: "发送到 2 个群" }).click();
  await expect(
    page.getByText("通知已进入发送队列，共 2 个群聊。"),
  ).toBeVisible();
  await expect(
    page.getByText("选课提醒", { exact: true }).last(),
  ).toBeVisible();
  await page.screenshot({
    path: "qa/screenshots/notifications.png",
    fullPage: true,
    animations: "disabled",
  });
  await unlockSettings(page);
  await expect(page.getByLabel("DeepSeek API Key")).toHaveCount(0);
  const appIdInput = page.getByPlaceholder("请输入 AppID");
  const botCard = appIdInput.locator("xpath=ancestor::section[1]");
  await expect(
    botCard.getByRole("button", { name: "恢复回答" }),
  ).toBeDisabled();
  await appIdInput.fill("123456789");
  await botCard.getByLabel("AppSecret").fill("test-app-secret");
  await botCard.getByRole("button", { name: "保存凭证" }).click();
  await expect(
    botCard.getByText("凭证已保存，QQ 消息接收进程将自动连接。"),
  ).toBeVisible();
  await expect(botCard.getByLabel("AppSecret")).toHaveValue("");
  await expect(
    botCard.getByRole("button", { name: "暂停回答" }),
  ).toBeEnabled();
  await expect(
    botCard.getByText("正常回答", { exact: true }),
  ).toBeVisible();
  await expect(botCard.getByText("正在运行", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "qa/screenshots/settings.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/notifications");
  await page.screenshot({
    path: "qa/screenshots/notifications-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.goto("/admin/questions");
  await page.screenshot({
    path: "qa/screenshots/knowledge-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "登录工作台" })).toBeVisible();
});

test("开发连接与设置单选互相独立、Token 实时显示", async ({ page }) => {
  await login(page);
  await unlockSettings(page);
  const deepseek = page.getByRole("region", { name: "千源·启智 D1 flash模型" }),
    zhipu = page.getByRole("region", { name: "千源·启智 Z1 flash模型" });
  const before = await (await page.request.get("/api/v1/admin/models")).json();
  for(const card of [deepseek,zhipu]){const disconnect=card.getByRole('button',{name:'断开'});if(await disconnect.isVisible())await disconnect.click();await card.getByRole("button", { name: "连接", exact: true }).click();await expect(card.getByRole("button", { name: "断开" })).toBeVisible();}
  const status = await (await page.request.get("/api/v1/admin/models")).json();
  expect(status.usage.totalTokens).toBeGreaterThanOrEqual(240);
  expect(status.activeTextProvider).toBe(before.activeTextProvider);
  await expect(
    page.getByRole("progressbar", { name: "额度消耗百分比" }),
  ).toBeVisible();
  await page.screenshot({
    path: "qa/screenshots/models-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "qa/screenshots/models-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.route("**/api/v1/admin/models", (route) =>
    route.fulfill({
      json: {
        ...status,
        usage: { ...status.usage, consumedPercent: 100, exhausted: true },
      },
    }),
  );
  await expect(
    page.getByText(
      "本周模型额度已超额，已停止新的模型调用。请等待下周重置；知识库直接匹配仍可使用。",
    ),
  ).toBeVisible({ timeout: 12000 });
  expect(await page.locator("body").innerText()).not.toMatch(
    /人民币|[￥¥]|已花费|实际金额/,
  );
});
