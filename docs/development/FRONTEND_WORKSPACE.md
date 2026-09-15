# 三代前端工作区说明

## 工作范围

- 主目录：`apps/web`。
- 接口消费：`apps/web/src/api` 与 `packages/contracts` 的前端类型。
- 自动化：`tests/e2e` 中的浏览器流程、390px 响应式和无障碍检查。
- 不在本分支直接修改数据库迁移、QQ 发送语义或后端事务；需要时先通过 OpenAPI 和共享契约提出变更。

## 日常验证

```powershell
npm run typecheck -w @campus/web
npm run build -w @campus/web
```

涉及接口契约时，先同步 `codex/v3-backend` 的冻结快照和 `packages/contracts`，再运行前端验证。涉及跨端行为时，追加对应 Playwright 测试并在 `docs/bugs/integration.md` 记录关联版本。

## 版本规则

每个通过前端类型检查、生产构建和相关 E2E 的批次创建 `fe-v3.0.0-dev.N` 标签并推送。构建警告和未阻断缺陷同样进入 Bug 台账，不以“构建成功”替代质量结论。
