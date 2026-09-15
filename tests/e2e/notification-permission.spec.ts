import { test, expect } from "@playwright/test";
test("群发权限失败显示具体原因，可复制与重新编辑；运行状态无问答规则", async ({
  page,
  context,
}) => {
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "127.0.0.54" });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const record = {
    id: "permission-test",
    title: "选课通知",
    content: "选课截至时间为9月9号，还没选课的同学尽快了",
    createdAt: Date.now(),
    targetCount: 1,
    pendingCount: 0,
    sentCount: 0,
    failedCount: 1,
    targets: [
      {
        id: "target-test",
        groupId: "group-test",
        groupLabel: "学生工作群 · 1班",
        status: "failed",
        attempts: 1,
        sentAt: null,
        lastError:
          "QQ 未授予主动群消息权限（40034105），请在 QQ 开放平台申请开通后再发送。",
        messageId: null,
      },
    ],
  };
  await page.route("**/api/v1/admin/notifications?**", (route) =>
    route.fulfill({ json: { items: [record] } }),
  );
  await page.route("**/api/v1/admin/qq/groups", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          json: {
            items: [
              {
                id: "group-test",
                label: "学生工作群 · 1班",
                groupNumber: "1234567890",
                nameSynced: true,
                available: true,
                enabled: true,
                firstSeen: Date.now(),
                lastSeen: Date.now(),
              },
            ],
          },
        })
      : route.continue(),
  );
  await page.goto("/login");
  await page.getByLabel("账号").fill("e2e-teacher");
  await page.getByLabel("口令").fill("test-only-password-123");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.waitForURL("**/admin");
  await page.goto("/admin/notifications");
  await expect(
    page.getByRole("link", { name: "查看群主授权步骤" }),
  ).toBeVisible();
  const item = page.getByRole("article").filter({ hasText: "选课通知" });
  await expect(item).toContainText("40034105");
  await item.getByRole("button", { name: "复制通知" }).click();
  await expect(item).toContainText("通知已复制");
  expect(
    (await page.evaluate(() => navigator.clipboard.readText())).replaceAll(
      "\r\n",
      "\n",
    ),
  ).toBe("@全体成员\n【选课通知】\n" + record.content);
  await item.getByRole("button", { name: "重新编辑" }).click();
  await expect(page.getByLabel("通知标题")).toHaveValue("选课通知");
  await expect(page.getByLabel("通知内容")).toHaveValue(record.content);
  await expect(
    page.getByRole("button", { name: "发送到 1 个群" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "qa/screenshots/ink-notification-permission.png",
    fullPage: true,
  });
  await page.goto("/admin/settings");
  await page.getByLabel("开发者密匙").fill("test-developer-key-123");
  await page.getByRole("button", { name: "验证并查看" }).click();
  await expect(
    page.getByRole("heading", { name: "QQ 机器人", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "问答规则" })).toHaveCount(0);
  await page.screenshot({
    path: "qa/screenshots/ink-settings.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "qa/screenshots/ink-settings-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});
