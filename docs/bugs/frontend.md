# 前端 Bug 台账

| Bug ID | 发现版本 | 状态 | 严重度 | 摘要 | 复现与证据 | 处理计划 |
| --- | --- | --- | --- | --- | --- | --- |
| FE-2026-001 | `be-v3.0.0-dev.1` 全量构建 | 新建 | 低 | Web 主 JavaScript 包超过构建警戒线 | `npm run build` 输出 `index-Bsf7npV3.js` 为 958.98 kB，Vite 对超过 650 kB 发出警告 | 在 Dashboard 与 Knowledge Center 模块化阶段引入路由级动态加载，并补充包体门禁 |

新增问题使用 `FE-YYYY-NNN` 编号，并按照 [追踪规则](README.md) 补齐复现、修复和回归信息。
