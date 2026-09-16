# 教务小助手三代四目标 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在两个开发日内交付只围绕答案正确、匹配稳定、追问有效、教师提效的可运行、可测量 MVP。

**Architecture:** 保留现有模块化单体、共享契约、领域路由和仓储事务基础。Web 与 QQ 继续共用 `AnswerService`；新增的知识快照、决定性决策、追问状态和评测记录都进入同一生产链路，教师工作台只优化单条待解答的三种最短完成路径。

**Tech Stack:** TypeScript 5.9、Node.js 22、Fastify 5、React 19、Vite 8、SQLite WAL、better-sqlite3、Node Test Runner、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-16-four-outcome-mvp-design.md`

## Global Constraints

- 首发只运行在单台教师 Windows 电脑上，面向单教师使用。
- 只实现答案正确、匹配稳定、追问有效、教师提效四项结果。
- 瞬时 20 条/秒、通用 Worker、通知扩展、资料解析扩展、多用户和云部署不属于本计划。
- Web 与 QQ 必须调用同一个回答应用服务；评测必须复用生产决策链路。
- 相同输入、知识版本和配置的决策签名必须可重复；模型不得生成候选外 FAQ ID。
- 高风险事实无可靠证据时只允许追问或转教师。
- 没有教师真实标注或 v1.0.3 基线时，报告必须显示“待真实数据验证”，不得宣称指标达标。
- 每项任务先写失败测试，提交前运行局部测试和全量相关检查。
- 前后端分别在现有 `codex/v3-backend` 与 `codex/v3-frontend` 工作目录实施、验证和提交。
- 不调用真实 QQ、真实付费模型或真实生产数据；不制作安装包。

---

## 文件职责图

### 后端新增文件

- `packages/contracts/src/evaluation.ts`：四项评测数据、运行结果和 API 契约。
- `packages/contracts/src/clarification.ts`：追问状态、缺失项和客户端可见结果契约。
- `apps/api/src/modules/answering/decision.ts`：输入规范化、知识/配置版本和稳定决策签名。
- `apps/api/src/modules/answering/quality-gate.ts`：关键事实、证据覆盖和高风险处置门禁。
- `apps/api/src/modules/conversations/clarification.ts`：信息充分性和最多两轮追问状态机。
- `apps/api/src/modules/evaluation/repository.ts`：评测仓储接口。
- `apps/api/src/modules/evaluation/runner.ts`：正确率、20 次稳定性和追问指标运行器。
- `apps/api/src/modules/evaluation/routes.ts`：教师读取/运行评测的 HTTP 接口。
- `apps/api/src/infrastructure/sqlite/evaluation-repository.ts`：评测批次和逐样本 SQLite 实现。
- `apps/api/src/modules/unmatched/timing.ts`：教师有效操作时长聚合。
- `scripts/run-mvp-evaluation.ts`：离线四目标评测命令。
- `tests/answer-decision.test.ts`：稳定决策和版本锁测试。
- `tests/answer-quality-gate.test.ts`：正确性与高风险门禁测试。
- `tests/clarification.test.ts`：追问判断、隔离和闭环测试。
- `tests/evaluation.test.ts`：四项指标公式、数据校验和报告测试。
- `tests/fixtures/mvp-evaluation.sample.json`：只用于验证运行器的非业务示例数据。

### 后端修改文件

- `packages/contracts/src/answers.ts`、`packages/contracts/src/index.ts`：回答结果携带追问与决策追踪字段并导出新契约。
- `apps/api/src/db/store.ts`、`apps/api/src/core/unit-of-work.ts`：暴露新增仓储和单事务能力。
- `apps/api/src/services/answer.ts`：编排追问、确定性检索、质量门禁和决策追踪。
- `apps/api/src/modules/answering/routes.ts`、`apps/api/src/modules/conversations/routes.ts`、`apps/api/src/modules/unmatched/routes.ts`：接入新增应用服务接口。
- `apps/api/src/app.ts`：注册评测路由。
- `apps/api/src/db/schema.ts`：声明新增表。
- `migrations/019_mvp_knowledge_and_decisions.sql`：知识版本、配置版本和决定追踪。
- `migrations/020_mvp_clarification.sql`：会话、消息和缺失项。
- `migrations/021_mvp_evaluation.sql`：评测批次和结果。
- `migrations/022_mvp_teacher_timing.sql`：教师处理计时。
- `package.json`：增加 `eval:*` 脚本。

### 前端新增文件

- `apps/web/src/features/unmatched/TaskTimer.ts`：只计算有效操作区间的计时状态机。
- `apps/web/src/features/unmatched/QuickResolvePanel.tsx`：关联 FAQ、新建 FAQ、直接回复三路径面板。
- `apps/web/src/features/unmatched/UnmatchedTaskCard.tsx`：单条待解答及自动下一条交互。
- `apps/web/src/features/unmatched/unmatched-workflow.css`：MVP 工作流局部样式。
- `apps/web/src/features/unmatched/TaskTimer.test.ts`：计时暂停/恢复/提交单元测试。
- `tests/e2e/mvp-four-outcomes.spec.ts`：追问闭环和教师最短路径 E2E。

### 前端修改文件

- `apps/web/src/pages/Knowledge.tsx`：保留页面装配和筛选，将单条处理下沉到新组件。
- `apps/web/src/api.ts`：新增计时和直接回复请求类型。
- `apps/web/src/main.tsx`：加载局部样式，不新增导航模块。
- `apps/web/src/api/generated.ts`：由 OpenAPI 脚本重新生成，禁止手工编辑。

---

### Task 1: 冻结四目标共享契约和数据库迁移

**Files:**
- Create: `packages/contracts/src/evaluation.ts`
- Create: `packages/contracts/src/clarification.ts`
- Create: `migrations/019_mvp_knowledge_and_decisions.sql`
- Create: `migrations/020_mvp_clarification.sql`
- Create: `migrations/021_mvp_evaluation.sql`
- Create: `migrations/022_mvp_teacher_timing.sql`
- Modify: `packages/contracts/src/answers.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/api/src/db/schema.ts`
- Test: `tests/contracts.test.ts`

**Interfaces:**
- Consumes: 现有 `AnswerInput`、`AnswerResult`、`AnswerTrace`、`Conversation`。
- Produces: `ClarificationDecision`、`DecisionSignature`、`EvaluationDataset`、`EvaluationRunSummary`、`TeacherTimingInput`。

- [ ] **Step 1: 为契约和严格 Schema 写失败测试**

在 `tests/contracts.test.ts` 增加：合法评测数据可解析；缺少 `datasetVersion`、风险等级、期望处置或关键事实时拒绝；回答追问必须带 `conversationId` 和 `missingSlot`；未知字段必须拒绝。

```ts
const sample: EvaluationDataset = {
  datasetVersion: 'teacher-gold-2026-09-16',
  knowledgeVersion: 'kv-1',
  configVersion: 'mvp-1',
  samples: [{
    id: 'gold-001', question: '缓考怎么办', expectedDisposition: 'answer',
    expectedFaqId: 'exam-deferral', requiredFacts: ['申请截止时间'], risk: 'high',
  }],
};
assert.equal(validateEvaluationDataset(sample).success, true);
```

- [ ] **Step 2: 运行契约测试并确认失败**

Run: `npx tsx --test tests/contracts.test.ts`

Expected: 因 `EvaluationDataset` 和 `validateEvaluationDataset` 未导出而失败。

- [ ] **Step 3: 实现精确类型和迁移**

`ClarificationDecision` 固定为：

```ts
export type ClarificationDecision =
  | {kind:'ready'; conversationId:string}
  | {kind:'ask'; conversationId:string; missingSlot:string; question:string; round:1|2}
  | {kind:'escalate'; conversationId:string; reason:'high_risk'|'round_limit'|'insufficient_context'};
```

`DecisionSignature` 固定包含 `disposition`、`faqId`、`knowledgeVersion`、`configVersion`、排序后的 `keyFacts` 和 `evidenceIds`。四个迁移只允许 `CREATE TABLE/INDEX`，不删除旧表或旧列。

- [ ] **Step 4: 运行契约、迁移和类型检查**

Run: `npx tsx --test tests/contracts.test.ts tests/repository-contracts.test.ts && npm run typecheck`

Expected: 全部通过。

- [ ] **Step 5: 提交契约和迁移**

```bash
git add packages/contracts/src apps/api/src/db/schema.ts migrations/019_mvp_knowledge_and_decisions.sql migrations/020_mvp_clarification.sql migrations/021_mvp_evaluation.sql migrations/022_mvp_teacher_timing.sql tests/contracts.test.ts
git commit -m "feat: define four-outcome mvp contracts"
```

### Task 2: 实现知识快照和确定性决策签名

**Files:**
- Create: `apps/api/src/modules/answering/decision.ts`
- Create: `tests/answer-decision.test.ts`
- Modify: `apps/api/src/modules/knowledge/repository.ts`
- Modify: `apps/api/src/infrastructure/sqlite/knowledge-repository.ts`
- Modify: `apps/api/src/core/unit-of-work.ts`
- Modify: `apps/api/src/services/answer.ts`

**Interfaces:**
- Consumes: Task 1 的 `DecisionSignature`。
- Produces: `normalizeQuestion(question:string):string`、`buildDecisionSignature(input:DecisionSignatureInput):DecisionSignature`、`KnowledgeRepository.currentSnapshot(workspaceId:string): KnowledgeSnapshot`。

- [ ] **Step 1: 写稳定性失败测试**

同一题库插入顺序不同、关键词顺序不同、包含全半角标点时运行 20 次，断言 `faqId`、`keyFacts` 和签名完全一致；同一分数使用 `faq.id` 升序作为最终稳定键。

```ts
const signatures = await Promise.all(Array.from({length:20}, () => decide('  缓考，怎么办？ ')));
assert.equal(new Set(signatures.map(item => item.hash)).size, 1);
assert.equal(signatures[0].faqId, 'exam-deferral');
```

- [ ] **Step 2: 运行测试并确认存在不稳定失败**

Run: `npx tsx --test tests/answer-decision.test.ts`

Expected: 因快照与签名实现不存在而失败。

- [ ] **Step 3: 实现规范化、版本快照和稳定排序**

规范化使用 NFKC、小写、控制字符清理和空白折叠；候选排序使用 `score DESC, faqId ASC`；签名前对关键事实和证据 ID 去重并按 Unicode 升序排列。知识版本由工作区当前有效 FAQ 的 `id:version:status` 稳定哈希生成，不使用当前时间。

- [ ] **Step 4: 接入 `AnswerService` 的 FAQ 路径**

每次回答开始锁定知识版本和 `configVersion='mvp-1'`，结束时产生 `decisionSignature`；旧 `AnswerResult` 字段保持兼容，新字段只追加。

- [ ] **Step 5: 验证 20 次回放和旧回归**

Run: `npx tsx --test tests/answer-decision.test.ts tests/api.test.ts tests/knowledge-center.test.ts && npm run typecheck`

Expected: 全部通过，20 次签名唯一值数量为 1。

- [ ] **Step 6: 提交确定性决策**

```bash
git add apps/api/src/modules/answering/decision.ts apps/api/src/modules/knowledge apps/api/src/infrastructure/sqlite/knowledge-repository.ts apps/api/src/core/unit-of-work.ts apps/api/src/services/answer.ts tests/answer-decision.test.ts
git commit -m "feat: make answer decisions reproducible"
```

### Task 3: 实现证据、关键事实和高风险门禁

**Files:**
- Create: `apps/api/src/modules/answering/quality-gate.ts`
- Create: `tests/answer-quality-gate.test.ts`
- Modify: `apps/api/src/services/answer.ts`
- Modify: `apps/api/src/services/rag.ts`
- Modify: `packages/contracts/src/answers.ts`

**Interfaces:**
- Consumes: `DecisionSignature`、现有 FAQ/RAG 结果。
- Produces: `evaluateAnswerQuality(input:QualityGateInput): QualityGateResult`，结果仅为 `pass`、`clarify`、`escalate`。

- [ ] **Step 1: 写质量门禁失败测试**

覆盖：高风险必需事实缺失转教师；RAG 事实无证据转教师；证据冲突转教师；低风险完整 FAQ 通过；系统不得从答案文本臆造截止日期。

```ts
assert.deepEqual(evaluateAnswerQuality({
  risk:'high', requiredFacts:['deadline'], facts:{}, evidence:[], conflicts:[],
}), {kind:'escalate', reason:'missing_required_fact', missingFacts:['deadline']});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx tsx --test tests/answer-quality-gate.test.ts`

Expected: 因质量门禁不存在而失败。

- [ ] **Step 3: 实现纯函数门禁**

门禁不调用模型、不修改数据库。`high` 风险且缺少任何必需事实、任何事实没有证据、证据冲突时返回 `escalate`；可由学生补充的对象/时间/校区字段返回 `clarify`；其余返回 `pass`。

- [ ] **Step 4: 接入 FAQ 与 RAG 回答**

FAQ 使用自身版本作为证据；RAG 必须返回非空来源 ID、版本和片段。门禁失败时 `AnswerService` 返回追问或 `manual_transfer`，并在决策追踪中记录拒绝原因。

- [ ] **Step 5: 运行质量与回答回归**

Run: `npx tsx --test tests/answer-quality-gate.test.ts tests/api.test.ts tests/models.test.ts tests/knowledge-center.test.ts && npm run typecheck`

Expected: 全部通过；高风险无证据样本没有直接答案。

- [ ] **Step 6: 提交质量门禁**

```bash
git add apps/api/src/modules/answering/quality-gate.ts apps/api/src/services/answer.ts apps/api/src/services/rag.ts packages/contracts/src/answers.ts tests/answer-quality-gate.test.ts
git commit -m "feat: gate unsupported and high-risk answers"
```

### Task 4: 实现最多两轮的结构化追问闭环

**Files:**
- Create: `apps/api/src/modules/conversations/clarification.ts`
- Create: `tests/clarification.test.ts`
- Modify: `apps/api/src/modules/conversations/repository.ts`
- Modify: `apps/api/src/infrastructure/sqlite/conversations-repository.ts`
- Modify: `apps/api/src/services/answer.ts`
- Modify: `apps/api/src/modules/conversations/routes.ts`

**Interfaces:**
- Consumes: Task 1 的 `ClarificationDecision`，Task 3 的 `clarify` 结果。
- Produces: `ClarificationService.evaluate(input, scope):ClarificationDecision` 和 `ClarificationService.merge(message, scope):ClarificationDecision`。

- [ ] **Step 1: 写追问状态失败测试**

测试事项缺失、对象缺失、时间缺失、补充后回答、同一槽位不重复问、第三轮转教师，以及工作区/渠道/目标/发送者四级隔离。

```ts
const first = service.evaluate({question:'这个什么时候截止？'}, scopeA);
assert.equal(first.kind, 'ask');
assert.equal(first.missingSlot, 'subject');
const second = service.merge({text:'缓考申请'}, scopeA);
assert.equal(second.kind, 'ready');
assert.equal(service.current(scopeB), null);
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx tsx --test tests/clarification.test.ts`

Expected: 因会话仓储和追问服务未实现而失败。

- [ ] **Step 3: 实现确定性缺失项和状态机**

缺失项优先级固定为 `subject → audience → campus → time`，每轮只问一个；问过的槽位持久保存；第二轮后仍不完整则转教师。会话键固定为 `workspaceId/channel/targetId/senderId`，Web 测试端使用显式测试身份，不共享全局会话。

- [ ] **Step 4: 接入统一回答链**

QQ 和 Web 输入先走追问判断；`context_update` 合并成功后重新调用同一 `AnswerService` 生产路径，不建立独立追问回答器。回答完成或转教师后关闭会话。

- [ ] **Step 5: 验证追问闭环和隔离**

Run: `npx tsx --test tests/clarification.test.ts tests/api.test.ts tests/group-identity.test.ts tests/qq-reply-policy.test.ts && npm run typecheck`

Expected: 全部通过；同一缺失项不重复；第三轮可靠转教师。

- [ ] **Step 6: 提交追问闭环**

```bash
git add apps/api/src/modules/conversations apps/api/src/infrastructure/sqlite/conversations-repository.ts apps/api/src/services/answer.ts tests/clarification.test.ts
git commit -m "feat: add bounded clarification loop"
```

### Task 5: 建立三项回答质量评测运行器

**Files:**
- Create: `apps/api/src/modules/evaluation/repository.ts`
- Create: `apps/api/src/infrastructure/sqlite/evaluation-repository.ts`
- Create: `apps/api/src/modules/evaluation/runner.ts`
- Create: `apps/api/src/modules/evaluation/routes.ts`
- Create: `scripts/run-mvp-evaluation.ts`
- Create: `tests/evaluation.test.ts`
- Create: `tests/fixtures/mvp-evaluation.sample.json`
- Modify: `apps/api/src/core/unit-of-work.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: 生产 `AnswerService`、`EvaluationDataset`、`DecisionSignature`。
- Produces: `EvaluationRunner.run(dataset):Promise<EvaluationRunSummary>` 和 `GET /api/v1/evaluations/:id`。

- [ ] **Step 1: 写公式与数据校验失败测试**

测试正确率、高风险错误率、20 次一致性、precision/recall/F1、任务完成率；无效样本必须让批次失败，不可静默排除。示例数据必须在报告中标注 `evidenceKind:'synthetic'` 和 `status:'not_claimable'`。

```ts
assert.deepEqual(calculateFollowup({tp:9,fp:1,fn:1,closed:9,totalAsked:10}), {
  precision:0.9, recall:0.9, f1:0.9, completionRate:0.9,
});
```

- [ ] **Step 2: 运行评测测试并确认失败**

Run: `npx tsx --test tests/evaluation.test.ts`

Expected: 因运行器和公式不存在而失败。

- [ ] **Step 3: 实现运行器和逐样本证据**

每条稳定性样本调用生产回答链 20 次，使用不同 request ID 但相同问题、知识版本和配置；保存每次决策签名以及首次分叉。报告包含代码提交、知识版本、配置版本、数据集版本、样本数、分子、分母、比率、目标和 `pass|fail|awaiting_real_data`。

- [ ] **Step 4: 实现教师只读 API 和 CLI**

增加：

```text
POST /api/v1/evaluations/run
GET  /api/v1/evaluations/:id
GET  /api/v1/evaluations/:id/results
```

`package.json` 增加 `eval:mvp`、`eval:correctness`、`eval:stability`、`eval:followup`，都调用 `scripts/run-mvp-evaluation.ts` 并要求显式 `--dataset`。

- [ ] **Step 5: 验证示例报告不会宣称达标**

Run: `npm run eval:mvp -- --dataset tests/fixtures/mvp-evaluation.sample.json && npx tsx --test tests/evaluation.test.ts tests/route-compatibility.test.ts && npm run typecheck`

Expected: 命令成功；示例报告状态为 `not_claimable`；旧路由兼容测试通过。

- [ ] **Step 6: 提交评测运行器**

```bash
git add apps/api/src/modules/evaluation apps/api/src/infrastructure/sqlite/evaluation-repository.ts apps/api/src/core/unit-of-work.ts apps/api/src/app.ts scripts/run-mvp-evaluation.ts tests/evaluation.test.ts tests/fixtures/mvp-evaluation.sample.json package.json
git commit -m "feat: add reproducible mvp evaluation"
```

### Task 6: 实现教师处理计时和原子完成接口

**Files:**
- Create: `apps/api/src/modules/unmatched/timing.ts`
- Modify: `apps/api/src/modules/unmatched/repository.ts`
- Modify: `apps/api/src/infrastructure/sqlite/unmatched-repository.ts`
- Modify: `apps/api/src/modules/unmatched/routes.ts`
- Modify: `apps/api/src/db/store.ts`
- Modify: `tests/unmatched-students.test.ts`
- Modify: `tests/repository-contracts.test.ts`

**Interfaces:**
- Consumes: 现有 `resolveUnmatched` 原子事务。
- Produces: `POST /api/v1/unmatched/:id/timing` 与 `TeacherEfficiencySummary`。

- [ ] **Step 1: 写计时和事务失败测试**

验证打开、暂停、恢复、完成；重复提交幂等；负时长和超过 8 小时的数据拒绝；FAQ 创建/关联、待解答状态、审计、回复目标和计时必须同事务成功或回滚。

```ts
assert.deepEqual(summarizeTeacherTiming([10000,30000,20000], [6000,12000,10000]), {
  baselineMedianMs:20000, currentMedianMs:10000, reductionRate:0.5,
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx tsx --test tests/unmatched-students.test.ts tests/repository-contracts.test.ts`

Expected: 因计时接口和仓储方法不存在而失败。

- [ ] **Step 3: 实现服务端计时验证和汇总**

客户端提交 `{taskId,sessionId,activeMs,elapsedMs,completionMode,clientStartedAt}`。服务端校验 `0 < activeMs <= elapsedMs <= 28_800_000`，以 `(workspace_id, session_id)` 保证幂等；中位数使用排序后中间值，偶数样本取中间两值平均。

- [ ] **Step 4: 把计时写入现有解决事务**

扩展 `resolve` 请求体接受可选 `timing`；有计时时与创建/关联 FAQ、解决待解答和审计同事务提交。独立 timing 接口只用于直接回复或恢复失败上传，不改变待解答状态。

- [ ] **Step 5: 运行并发、事务和类型检查**

Run: `npx tsx --test tests/unmatched-students.test.ts tests/repository-contracts.test.ts tests/api.test.ts && npm run typecheck`

Expected: 全部通过；故障注入后没有孤立 FAQ、计时或回复目标。

- [ ] **Step 6: 提交教师效率后端**

```bash
git add apps/api/src/modules/unmatched apps/api/src/infrastructure/sqlite/unmatched-repository.ts apps/api/src/db/store.ts tests/unmatched-students.test.ts tests/repository-contracts.test.ts
git commit -m "feat: measure atomic teacher resolutions"
```

### Task 7: 重构待解答为三路径最短工作流

**Files:**
- Create: `apps/web/src/features/unmatched/TaskTimer.ts`
- Create: `apps/web/src/features/unmatched/TaskTimer.test.ts`
- Create: `apps/web/src/features/unmatched/QuickResolvePanel.tsx`
- Create: `apps/web/src/features/unmatched/UnmatchedTaskCard.tsx`
- Create: `apps/web/src/features/unmatched/unmatched-workflow.css`
- Modify: `apps/web/src/pages/Knowledge.tsx`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/main.tsx`

**Interfaces:**
- Consumes: Task 6 的解决与计时请求体。
- Produces: `TaskTimer`、`QuickResolvePanel` 和完成后 `onResolved(nextId)`。

- [ ] **Step 1: 写前端计时器失败测试**

测试窗口失焦、弹窗取消和请求等待不计入 `activeMs`；恢复后继续；完成只生成一次 payload。

```ts
timer.start(0); timer.pause(5000); timer.resume(15000);
assert.deepEqual(timer.complete(20000), {activeMs:10000, elapsedMs:20000});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npx tsx --test apps/web/src/features/unmatched/TaskTimer.test.ts`

Expected: 因 `TaskTimer` 不存在而失败。

- [ ] **Step 3: 实现单条任务组件与三路径面板**

卡片打开即聚焦首个主要操作并启动计时；三个互斥动作是“关联已有题”“新建题目”“直接回复”。新建题预填原问题，关联题展示 FAQ ID/版本/答案摘要，直接回复限制 1–1500 字。

- [ ] **Step 4: 实现成功自动下一条和失败保留输入**

成功后移除当前条目、停止计时并聚焦下一条；409 冲突刷新当前项但保留草稿；其他失败保留面板、输入和计时暂停状态。不得自动重试写请求。

- [ ] **Step 5: 验证前端测试、类型和构建**

Run: `npx tsx --test apps/web/src/features/unmatched/TaskTimer.test.ts && npm run typecheck -w @campus/web && npm run build -w @campus/web`

Expected: 全部通过；构建产物可生成。

- [ ] **Step 6: 提交前端最短工作流**

```bash
git add apps/web/src/features/unmatched apps/web/src/pages/Knowledge.tsx apps/web/src/api.ts apps/web/src/main.tsx
git commit -m "feat: streamline teacher answer workflow"
```

### Task 8: 完成前后端契约同步和关键 E2E

**Files:**
- Create: `tests/e2e/mvp-four-outcomes.spec.ts`
- Modify: `docs/api/openapi-v1.0.3.json`
- Modify: `apps/web/src/api/generated.ts`
- Modify: `tests/route-compatibility.test.ts`
- Modify: `tests/e2e-server.ts`

**Interfaces:**
- Consumes: Tasks 1–7 的全部 API。
- Produces: 可重复的“问题→追问→回答”和“待解答→教师完成→下一条”浏览器证据。

- [ ] **Step 1: 写两个关键 E2E 场景**

场景一提交信息不足问题，断言只出现一个明确追问，补充后得到预期 FAQ ID；场景二从待解答首页完成关联 FAQ，断言自动进入下一条并上传计时。

- [ ] **Step 2: 导出 OpenAPI 并生成前端客户端**

Run: `npm run api:export && npm run api:generate`

Expected: 新增评测、追问和计时契约被生成；现有路由不消失。

- [ ] **Step 3: 运行契约与 E2E**

Run: `npx tsx --test tests/route-compatibility.test.ts tests/openapi-source-hash.test.ts && npx playwright test tests/e2e/mvp-four-outcomes.spec.ts`

Expected: 全部通过；两个场景无控制台错误。

- [ ] **Step 4: 运行前后端全量验证**

Run: `npm test && npm run typecheck && npm run build`

Expected: 全部通过；只允许记录已知的前端 bundle 体积警告，不允许新增错误。

- [ ] **Step 5: 提交联调结果**

```bash
git add docs/api/openapi-v1.0.3.json apps/web/src/api/generated.ts tests/route-compatibility.test.ts tests/e2e-server.ts tests/e2e/mvp-four-outcomes.spec.ts
git commit -m "test: verify four-outcome mvp workflows"
```

### Task 9: 生成验收证据、Bug 台账和开发版本

**Files:**
- Create: `docs/qa/four-outcome-mvp-report.md`
- Modify: `docs/bugs/backend.md`
- Modify: `docs/bugs/frontend.md`
- Modify: `docs/bugs/integration.md`
- Modify: `docs/development/VERSIONS.md`
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: 全量测试、四项目标报告和前端构建结果。
- Produces: 可审计的 MVP 验收报告、后端/前端开发标签和远端备份。

- [ ] **Step 1: 运行真实数据可用性检查**

检查教师黄金集、追问标注集和 v1.0.3 操作时长基线。不存在时报告相应指标为 `awaiting_real_data`；存在时运行四个门禁并记录分子、分母、版本和失败样本链接。

- [ ] **Step 2: 运行最终验证命令**

Run: `npm test && npm run typecheck && npm run build && npm run api:check`

Expected: 所有命令退出码为 0。

- [ ] **Step 3: 更新验收报告和 Bug 台账**

报告逐项写明目标、实际值、证据类型、是否可宣称达标和阻断项。每个 Bug 包含 ID、版本、复现步骤、期望、实际、严重度、状态和关联测试；P0/P1 必须为零才能发布开发版本。

- [ ] **Step 4: 更新版本并提交**

后端版本设为 `3.0.0-dev.4`，前端同步相同契约版本。分别提交：

```bash
git add README.md package.json docs/qa/four-outcome-mvp-report.md docs/bugs docs/development/VERSIONS.md
git commit -m "chore: release four-outcome mvp dev.4"
```

- [ ] **Step 5: 创建标签并推送两个工作分支**

后端标签 `be-v3.0.0-dev.4`，前端标签 `fe-v3.0.0-dev.4`；推送 `codex/v3-backend`、`codex/v3-frontend` 和两个标签。推送前再次确认两个工作区无非本任务改动。

- [ ] **Step 6: 明确停止点**

交付源码、测试和报告后停止。未收到用户原话“确认打包”时，不运行 `package`、`desktop:package` 或安装包脚本。

---

## 两日执行顺序

```mermaid
flowchart LR
    D1A[Day 1 / Task 1 契约迁移] --> D1B[Task 2 稳定决策]
    D1B --> D1C[Task 3 正确性门禁]
    D1C --> D1D[Task 4 追问闭环]
    D1D --> D1E[Task 5 质量评测]
    D1E --> D2A[Day 2 / Task 6 计时与事务]
    D2A --> D2B[Task 7 教师工作流]
    D2B --> D2C[Task 8 联调 E2E]
    D2C --> D2D[Task 9 验收与版本]
```

Tasks 1–6 主要在后端工作目录执行；Task 7 在前端工作目录执行；Task 8–9 由前后端分别验证后汇总。Task 2 与 Task 7 不并行，因为前端必须以冻结后的计时和解决契约为准；后端内部也按 1→6 顺序实施，避免重复迁移和接口返工。
