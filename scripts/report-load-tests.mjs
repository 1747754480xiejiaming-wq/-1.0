import fs from 'node:fs';
import path from 'node:path';
const report=JSON.parse(fs.readFileSync('qa/latest-load-report.json','utf8'));
const resources=fs.readFileSync(path.join(report.runtime,'resources.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const scenarios={baseline:['基线',10,'30 秒'],peak:['峰值',50,'45 秒'],spike:['突增',100,'30 秒'],soak:['短时持续',25,'315 秒（稳定段 300 秒）'],queue:['通知队列',10,'40 秒']};
const rows=report.results.map(({scenario,exitCode,summary})=>{const [name,vu,duration]=scenarios[scenario],m=summary.metrics;return `| ${name} | ${vu} | ${duration} | ${m.http_reqs.count} | ${m.http_reqs.rate.toFixed(1)} | ${m.http_req_duration['p(95)'].toFixed(2)} | ${m.http_req_duration['p(99)'].toFixed(2)} | ${(m.http_req_failed.value*100).toFixed(2)}% | ${exitCode===0?'通过':'未通过'} |`;});
const memory={samples:resources.length,maxRssMB:Math.max(...resources.map(x=>x.rss))/1024**2,firstRssMB:resources[0].rss/1024**2,lastRssMB:resources.at(-1).rss/1024**2,maxEventLoopP99Ms:Math.max(...resources.map(x=>x.eventLoopP99Ms))};
const output={...report,runtime:undefined,memory};fs.mkdirSync('docs/test-results',{recursive:true});fs.writeFileSync('docs/test-results/k6-results.json',JSON.stringify(output,null,2));
const total=report.results.reduce((n,x)=>n+x.summary.metrics.http_reqs.count,0),allPassed=report.results.every(x=>x.exitCode===0);
fs.writeFileSync('docs/稳定性测试报告.md',`# 校园教务小助手 · 稳定性测试报告

测试时间：${report.date}（UTC，北京时间加 8 小时）。本轮 ${allPassed?'全部预设场景达到阈值':'存在未达阈值场景'}，共 ${total.toLocaleString('en-US')} 个 HTTP 请求。测试环境为本机隔离数据库，未向真实 QQ 群发送测试消息。

## 技能与工具

采用 [load-test-scenario-builder](https://github.com/patricio0312rev/skills) 技能，按基线、峰值、突增、持续运行和业务队列划分场景。技能搜索时列出 191 次安装，是本次“load testing”检索结果中安装数最高的候选；这不是全平台排名。

执行器为 Grafana k6 2.2.0，阈值用法依据 [k6 官方文档](https://grafana.com/docs/k6/latest/using-k6/thresholds/)。代码位于 \`load-tests\` 与 \`scripts/run-load-tests.mjs\`。

## 环境与负载

- ${report.platform}，Node ${report.node}；${report.cpus}，${report.logicalProcessors} 个逻辑处理器，${report.memoryGB.toFixed(1)} GiB 内存。
- Fastify + SQLite WAL 磁盘数据库，20 条演示 FAQ；本机 HTTP 回环网络；关闭真实模型调用。
- 问答场景每次迭代请求服务状态和一条 FAQ，停顿 0.2 秒；队列场景每次创建一条通知、选择 3 个模拟群、领取任务、标记开始、模拟回执并查询历史，停顿 0.5 秒。
- 通过不同测试来源 IP 模拟分散用户，问答携带机器人服务令牌，以测量 QQ 问答业务处理能力。生产限流保持原配置；429 行为另由自动测试验证。
- 压测与打包/浏览器测试在同一电脑运行，测量包含本机其他任务的资源竞争。并发量是虚拟用户数，不等同于真实校园在线人数。

## 结果

| 场景 | 最大 VU | 时长 | HTTP 请求 | 请求/秒 | P95 毫秒 | P99 毫秒 | HTTP 失败率 | 阈值 |
|---|---:|---|---:|---:|---:|---:|---:|---|
${rows.join('\n')}

问答阈值：HTTP 失败率 < 1%，业务错误率 < 1%，检查通过率 > 99%，HTTP P95 < 500ms、P99 < 1000ms，问答 P95 < 600ms。通知队列阈值：HTTP 和队列错误率 < 1%，检查通过率 > 99%，HTTP P95 < 750ms、P99 < 1500ms，入队 P95 < 750ms。k6 每个场景退出码均保存在原始 JSON，非零表示未通过。

队列创建 ${report.notifications.n} 条通知，${report.queue.map(x=>x.count+' 个目标状态为 '+x.status).join('，')}；重复的“通知+群聊”记录数为 ${report.duplicates.n}。SQLite 完整性：\`${report.integrity}\`。

每 5 秒采样 API 进程，共 ${memory.samples} 个资源样本；采样 RSS 首次 ${memory.firstRssMB.toFixed(1)} MiB、末次 ${memory.lastRssMB.toFixed(1)} MiB、峰值 ${memory.maxRssMB.toFixed(1)} MiB。事件循环采样 P99 的最大值 ${memory.maxEventLoopP99Ms.toFixed(2)}ms。这是 Node 测试 API 的资源占用，不包含 Electron 窗口和 k6 进程。

## 发现并修复的问题

持续运行时，统计路径反复创建 Intl.DateTimeFormat，增加内存与 CPU 开销。现改为复用同一个时区格式化器，完成上述全套复测。

通知新增持久化领取凭证和发送开始标记。重复点击/丢失入队响应后重试不会重复创建通知；已开始的外部发送在崩溃或超时后不自动重放；回写失败只重试本地回执。失败、停用群、旧凭证、重启持久化和数据库完整性由 30 项 API/服务/CLI 自动测试覆盖。

## 桌面与页面验证

Chromium 端到端 4 / 4 通过，包含桌面、390px 手机、两个群同时选择、群备注修改、登录、知识维护与失败重试。直接运行交付的便携 EXE 验证内置服务、老师登录、两群通知、丢失 HTTP 响应后的幂等重试、自动更新模拟回执、关闭后端口释放、重启后记录保留。Electron 自动化连接方式参考 [Playwright 官方说明](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp)。

## 复现与 CI

安装依赖和 k6 后运行：

\`\`\`powershell
npm ci --ignore-scripts --no-audit --no-fund
$env:K6_EXE = 'C:\\工具\\k6.exe'
npm run test:load
node scripts/report-load-tests.mjs
\`\`\`

运行器自动创建新隔离库、启动 3201 测试 API、执行五场景、检查队列与完整性，结束时停止测试进程。\`npm run test:load\` 可直接作为 CI 性能门禁；阈值失败、队列不完整或数据库检查失败时返回非零。归档 \`qa/latest-load-report.json\`、本次运行目录中的场景 JSON 与资源采样；不要归档包含临时会话令牌的 \`qa/load-session.json\`。已提供手动触发的 GitHub Actions 工作流。

## 范围

本结果验证本机 MVP 在所测并发和约 5 分钟持续负载下的行为，没有寻找最大故障点，也不代表数小时/数天运行、真实 QQ 发送额度、外部 Qwen / DeepSeek 延迟、校园网络或多机器部署能力。真实群消息的权限、配额和接收效果由老师在授权群内进一步验收；本轮没有发送真实群通知。
`);
console.log(JSON.stringify({total,allPassed,memory},null,2));
