import { test, expect } from "@playwright/test";

test("设置内嵌开发管理系统、单选模型并保留动态额度与 Pro 升级", async ({
  page,
}) => {
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "127.0.0.61" });
  await page.goto("/login");
  await page.getByLabel("账号").fill("e2e-teacher");
  await page.getByLabel("口令").fill("test-only-password-123");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByText("本周额度消耗", { exact: true })).toBeVisible();
  await expect(page.getByText("Plus", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("progressbar", { name: "本周额度消耗百分比" }),
  ).toBeVisible();
  const modelPicker=page.getByRole('region',{name:'回答模型选择'});
  await expect(modelPicker.getByRole('radio')).toHaveCount(2);
  await modelPicker.getByRole('radio',{name:'千源·启智 Z1 flash'}).click();
  await expect(modelPicker.getByRole('radio',{name:'千源·启智 Z1 flash'})).toBeChecked();
  await expect(modelPicker.getByRole('radio',{name:'千源·启智 D1 flash'})).not.toBeChecked();
  await expect(modelPicker.getByRole('alert')).toHaveText('该模型无权限');
  await page.getByRole("button", { name: "升级为 Pro" }).click();
  const upgrade = page.getByRole("dialog", { name: "升级为 Pro" });
  await upgrade.getByLabel("升级密匙").fill("test-developer-key-123");
  await upgrade.getByRole("button", { name: "确认升级" }).click();
  await expect(upgrade).not.toBeVisible();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByText("Pro", { exact: true })).toBeVisible();
  await page.getByRole('button',{name:'开发管理系统',exact:true}).click();
  const developer=page.getByRole('dialog',{name:'开发管理系统'});
  await expect(developer.getByRole("heading", { name: "开发者验证" })).toBeVisible();
  await expect(page.getByText("QQ 机器人", { exact: true })).toHaveCount(0);
  await developer.getByLabel("开发者密匙").fill("错误密匙12345678");
  await developer.getByRole("button", { name: "验证并查看" }).click();
  await expect(developer.getByText("开发者密匙不正确。")).toBeVisible();
  await developer.getByLabel("开发者密匙").fill("test-developer-key-123");
  await developer.getByRole("button", { name: "验证并查看" }).click();
  await expect(developer.getByRole("heading", { name: "QQ 机器人" })).toBeVisible();
  await expect(developer.getByRole('region',{name:'千源·启智 D1 flash模型'})).toBeVisible();
  await expect(developer.getByRole('region',{name:'千源·启智 Z1 flash模型'})).toBeVisible();
});

test("未配置模型时可在开发管理系统输入 API Key 并连接", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "X-Forwarded-For": "127.0.0.62" });
  await page.goto("/login");
  await page.getByLabel("账号").fill("e2e-teacher");
  await page.getByLabel("口令").fill("test-only-password-123");
  await page.getByRole("button", { name: "进入工作台" }).click();
  await page.waitForURL("**/admin");

  const statusResponse = await page.request.get("/api/v1/admin/models");
  expect(statusResponse.ok()).toBeTruthy();
  const realStatus = await statusResponse.json();
  let submittedKey = "";
  let connected = false;
  await page.route("**/api/v1/admin/models", async route => {
    if (route.request().method() !== "GET") return route.continue();
    const providers = realStatus.providers.map((item: { provider: string }) =>
      item.provider === "zhipu"
        ? { ...item, keyConfigured: connected, connected }
        : item,
    );
    await route.fulfill({ json: { ...realStatus, providers } });
  });
  await page.route("**/api/v1/admin/models/zhipu/connect", async route => {
    submittedKey = route.request().postDataJSON().apiKey;
    connected = true;
    await route.fulfill({ json: { ...realStatus, message: "连接成功" } });
  });

  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "开发管理系统", exact: true }).click();
  const developer = page.getByRole("dialog", { name: "开发管理系统" });
  await developer.getByLabel("开发者密匙").fill("test-developer-key-123");
  await developer.getByRole("button", { name: "验证并查看" }).click();

  const zhipu = developer.getByRole("region", { name: "千源·启智 Z1 flash模型" });
  const keyInput = zhipu.getByLabel("智谱 API Key");
  await expect(keyInput).toBeVisible();
  await keyInput.fill("test-zhipu-api-key");
  await zhipu.getByRole("button", { name: "连接", exact: true }).click();
  await expect.poll(() => submittedKey).toBe("test-zhipu-api-key");
  await expect(keyInput).not.toBeVisible();
  await expect(zhipu.getByRole("button", { name: "断开" })).toBeVisible();
});
