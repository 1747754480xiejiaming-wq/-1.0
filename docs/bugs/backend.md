# 后端与开发环境 Bug 台账

| Bug ID | 发现版本 | 状态 | 严重度 | 摘要 | 复现与证据 | 处理与回归 |
| --- | --- | --- | --- | --- | --- | --- |
| DEV-ENV-001 | `be-v3.0.0-dev.1` | 已关闭 | 低 | `tsx -e` 的 CommonJS 输出模式不支持顶层 `await` | 在后端工作区执行含顶层 `await` 的 `npx tsx -e`，esbuild 返回 2 个 transform errors | 改为异步 IIFE 后成功输出 96 个业务路由；不影响产品代码 |
| DEV-ENV-002 | `be-v3.0.0-dev.2` | 已关闭 | 低 | 独立 Fastify 测试默认删除多余字段，无法证明严格拒绝 | 严格 Schema 测试加入 `unexpected` 后仍返回 204；生产 API 已确认配置 `removeAdditional: false` | 测试校验器同步生产 AJV 配置后，多余字段返回 400；产品代码无需修改 |
| DEV-ENV-003 | `be-v3.0.0-dev.2` | 已关闭 | 低 | 契约测试请求体使用 `unknown` 导致 Fastify 重载推断失败 | 运行测试通过，但 `npm run typecheck` 在 `app.inject` 报 TS2322 和 TS2339 | 将辅助函数参数收窄为实际使用的 JSON 对象，重新执行类型检查和测试 |

## 新 Bug 记录模板

### BE-YYYY-NNN：标题

- 发现版本：
- 状态：新建
- 严重度：阻断 / 高 / 中 / 低
- 环境：
- 前置条件：
- 复现步骤：
- 预期结果：
- 实际结果：
- 影响范围：
- 日志或截图：
- 修复提交：
- 回归版本与结果：
