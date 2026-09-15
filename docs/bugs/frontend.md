# 前端 Bug 台账

| Bug ID | 发现版本 | 状态 | 严重度 | 摘要 | 复现与证据 | 处理计划 |
| --- | --- | --- | --- | --- | --- | --- |
| FE-2026-001 | `be-v3.0.0-dev.1` 全量构建 | 新建 | 低 | Web 主 JavaScript 包超过构建警戒线 | `npm run build` 输出 `index-Bsf7npV3.js` 为 958.98 kB，Vite 对超过 650 kB 发出警告 | 在 Dashboard 与 Knowledge Center 模块化阶段引入路由级动态加载，并补充包体门禁 |
| FE-2026-002 | `fe-v3.0.0-dev.2.2` Task 3 兼容审查 | 新建 | 中 | 页面调用未接入 Task 2 生成的 API 客户端 | `apps/web/src/api/generated.ts` 未被传输层或页面导入；实际请求继续使用裸路径字符串，类型检查无法发现路径漂移 | 在后续前端契约接入任务中让传输层接受生成 operation，并增加页面路径静态门禁 |
| FE-2026-003 | `fe-v3.0.0-dev.2.2` Task 3 兼容审查 | 新建 | 中 | 上传和下载遇到 401 时不会触发统一会话失效 | `apps/web/src/api.ts` 仅在 JSON `api()` 中派发 `session-expired`，`apiUpload()` 与 `apiDownload()` 缺少同等处理 | 统一三种传输函数的 401 行为，并补充 multipart、Blob 会话过期测试 |

新增问题使用 `FE-YYYY-NNN` 编号，并按照 [追踪规则](README.md) 补齐复现、修复和回归信息。
