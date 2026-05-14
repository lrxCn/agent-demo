# 监控体系进度追踪（Phase 7 接力棒）

> 这个文件是监控体系（Phase 7）的「接力棒」。每完成一个 prompt 后**必须**更新对应行状态。
>
> 新开 Cursor 会话时，让它先读以下 3 份文件了解上下文：
>
> 1. `@docs/monitor/REQUIREMENTS.md` — 元需求 + 已决策事项
> 2. `@docs/monitor/1.PRD.md` — 5 大目标的可勾选验收清单
> 3. `@docs/monitor/PROGRESS.md` — 本文件，当前进度
>
> 然后再读对应 `prompts/phase-N-*/step-M-*.md`。

---

## 状态标记

- ⬜ 未开始
- 🔄 进行中
- ✅ 已完成
- ❌ 有问题需修复

---

## 文档产出阶段（Phase 7-0：规划）

**整体：🔄 进行中（2026-05-13 启动）**

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 7-0-1 | `REQUIREMENTS.md` v0.3 READY | ✅ | 2026-05-13 | 项目持有人 12 项决策已锁定，§8.1 不做清单已护栏 |
| 7-0-2 | `1.PRD.md` v1（5 目标 66 个验收点） | ✅ | 2026-05-13 | 已对齐 §8 决策 + 4 个澄清答案 |
| 7-0-3 | `2.TECH_SELECTION.md` v1（社区方案选型） | ✅ | 2026-05-13 | LangSmith Cloud / W3C trace / Ragas / Kimi-K2.6 LLM-as-judge |
| 7-0-4 | `3.ARCHITECTURE.md` v1（唯一 ASCII 架构图） | ✅ | 2026-05-13 | 9 个 ★ 叠加点 + 4 条数据流 |
| 7-0-5 | `4.ARCHITECTURE_FOR_AI.md` v1（纯文字） | ✅ | 2026-05-13 | Cursor 自动加载用 |
| 7-0-6 | `PROGRESS.md`（本文件）初版 | ✅ | 2026-05-13 | |
| 7-0-7 | `DEVELOPER_GUIDE.md` | ✅ | 2026-05-13 | 开发者如何与 Cursor 配合完成本体系 |
| 7-0-8 | `USER_GUIDE.md` | ✅ | 2026-05-13 | 体系建成后，开发者如何日常使用看板/eval/告警 |
| 7-0-9 | `README.md` | ✅ | 2026-05-13 | 本子模块的一页纸入口 |
| 7-0-10 | `prompts/phase-1-trace/*.md` 5 个 | ✅ | 2026-05-13 | 详见下方 Phase 7-1 表 |
| 7-0-11 | `prompts/phase-2-observability/*.md` 3 个 | ✅ | 2026-05-13 | 详见下方 Phase 7-2 表 |
| 7-0-12 | `prompts/phase-3-eval/*.md` 5 个 | ✅ | 2026-05-13 | 详见下方 Phase 7-3 表 |
| 7-0-13 | `prompts/phase-4-guardrails/*.md` 5 个 | ✅ | 2026-05-13 | 详见下方 Phase 7-4 表 |
| 7-0-14 | `prompts/phase-5-cost-playbook/*.md` 1 个 | ✅ | 2026-05-13 | 详见下方 Phase 7-5 表（目录名为 `phase-5-cost-playbook`） |
| 7-0-15 | `.cursor/rules/05-monitoring-context.mdc` 新增 | ✅ | 2026-05-13 | globs 限定为 `docs/monitor/**` + 三层 `observability/`+`guardrails/`+`eval/` |
| 7-0-16 | `.cursorrules` 追加"监控体系开发约定"小节 | ✅ | 2026-05-13 | 强制读 REQUIREMENTS + PROGRESS |
| 7-0-17 | `.cursorignore` 追加 `docs/monitor/prompts/` | ⬜ | | 避免 prompt 文件污染索引 |
| 7-0-18 | `docs/PROJECT_STATUS.md` 追加 "Phase 7: 监控与运维体系" | ✅ | 2026-05-13 | 已增加 Phase 7 区块并指向本文件 |

---

## Phase 7-1：全链路 Trace（目标 2，P0 基石）

**整体：⬜ 未开始**（预估 1.5 天）

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 7-1-1 | LangSmith 启用与项目命名 | ✅ | 2026-05-13 | LangSmith 元数据上报成功（metadata submit 204）；project=`plan2code-agent`；首条 run=`019e2067-36cd-7e52-be82-665f2b011f97` 已触发 |
| 7-1-2 | 前端 trace_id 注入（P1） | ✅ | 2026-05-13 | utils/trace.ts + axios/streamChat 注入 traceparent + useChat 预留 trace 事件分支 |
| 7-1-3 | 后端 trace 拦截器 + 结构化日志（P4） | ✅ | 2026-05-13 | TraceContext / TraceInterceptor / StructuredLogMiddleware 已注册；agent.service.ts 演示日志改造完成 |
| 7-1-4 | Agent metadata 主动打标 + SSE run_id 回流（P8 + SSE 改造） | ✅ | 2026-05-14 | `state.py` 加 `app_trace_id`；`chat_node` 调 `RunTree.add_metadata`；`agent.service.ts` 增加 `metadata` stream_mode + `extractRunIdFromMetadata` + SSE `trace` 事件 |
| 7-1-5 | 端到端 trace 验证 | ⬜ | | 三端 trace_id 一致；LangSmith metadata 可搜；错误路径 trace_id 可回溯（DoD-1） |

---

## Phase 7-2：可观测性看板（目标 1，P0）

**整体：✅ 已完成（2026-05-14）**（实际工期 1 天，前置依赖 Phase 7-1）

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 7-2-1 | LangSmith Models 单价配置（4 条记录） | ✅ | 2026-05-14 | 4 条 Models 已配置（`Pro/deepseek-ai/DeepSeek-V3.2` / `Pro/moonshotai/Kimi-K2.6` / `BAAI/bge-large-zh-v1.5` / `BAAI/bge-reranker-v2-m3`）；trace 详情页 Cost 已显示美元金额；`USER_GUIDE.md` 价格快照已沉淀 |
| 7-2-2 | 业务指标 tag 注入（`rag:hit` / `rag:miss`） | ✅ | 2026-05-14 | `nodes.py` 新增 `_kb_search_hit_or_miss`（含 `tool_call_id` 反查兜底）；`chat_node` 与 `tool_node_with_retry` 均按 KB 返回打 tag；LangSmith Filter 可命中 |
| 7-2-3 | LangSmith Dashboard 配置（6 个卡片） | ✅ | 2026-05-14 | 命名 `plan2code-cost-overview`；URL 已沉淀到 `USER_GUIDE.md` |

---

## Phase 7-3：Bad Case + Eval（目标 3，P1）

**整体：✅ 已完成（2026-05-14）**（实际工期 1 天，前置依赖 Phase 7-1）

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 7-3-1 | Eval CLI Runner（P6'） | ✅ | 2026-05-14 | `src/eval/runner.py` + 3 个 evaluators + 2 个 `__init__`；`pyproject.toml` 增加 `langsmith`/`ragas` 与 `[project.scripts] eval`；根 `package.json` 增加 `eval:run`；`.env.example` 增加 `OPENAI_LLM_AS_JUDGE` 与 3 个 `LANGSMITH_DATASET_*` |
| 7-3-2 | 前端反馈 UI（P3） | ✅ | 2026-05-14 | `ChatBubble.vue` 三按钮 + `postFeedback` API + `chat` store `setMessageFeedback`；点击已发起 POST（Step 3 前预期 404） |
| 7-3-3 | 后端反馈接口 + LangSmith REST（P6） | ✅ | 2026-05-14 | `feedback.controller` + `feedback.service`；`POST /agent/feedback` 转发 LangSmith `/feedback` + `PATCH /runs/{id}` tag；前端三按钮联调可用 |
| 7-3-4 | Dataset 自动路由 | ✅ | 2026-05-14 | `feedback.service.ts` 新增 `fetchRun/routeDataset/ensureDataset/addRunToDataset`；按 tags 路由 3 个 dataset；`down` 反馈自动入库 |
| 7-3-5 | Eval `--baseline` 跑分对比 | ✅ | 2026-05-14 | `runner.py` 新增 `_fetch_baseline_summary` + `_print_diff_table`；CLI `--baseline` 输出 4 列 diff 表 |

---

## Phase 7-4：Agent 边界 & 安全限制（目标 4，P1）

**整体：✅ 已完成（2026-05-14）**（实际工期 1 天，**步骤顺序严格按 `REQUIREMENTS.md` §8 决策 #9 锁定**）

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 7-4-1 | token 配额（P5 Backend 部分） | ✅ | 2026-05-14 | `quota` 模块 + `ioredis` 依赖；`agent.controller.ts` 入口预检（checkAndReserve）；`agent.service.ts` 流结束 commit；`.env.example` 增加 3 个 QUOTA 配置 |
| 7-4-2 | 工具白名单按角色生效（P5 Agent 部分） | ✅ | 2026-05-14 | `agent/tool-acl.service.ts` 解析 `permissionCodes`；`agent.service.ts` 注入并写入 `input.allowed_builtin_tools`；`state.py` 新字段；`nodes.py` 按白名单过滤 builtin（缺失字段兜底全允许） |
| 7-4-3 | prompt-injection 关键词初筛（P7 输入侧） | ✅ | 2026-05-14 | `agent/src/guardrails/input_filter.py` + `blacklist.yaml`；YAML 热更新；`chat_node` 入口扫描最近 HumanMessage，命中后追加 SystemMessage 警告并写 trace tag/metadata（v1 仅警告不拒绝） |
| 7-4-4 | 输出 PII / 敏感词扫描（P7 输出侧） | ✅ | 2026-05-14 | `agent/src/guardrails/output_filter.py` + `sensitive.yaml` 热加载；`chat_node` return 前 sanitize，命中写 trace tag `guardrail:output:pii` + metadata replacements（默认不追加 SSE 安全提示） |
| 7-4-5 | 审计日志落库（P9） | ✅ | 2026-05-14 | `audit_logs` 表 + `IAuditLogDao` + `AuditService` + `AuditController`（`INTERNAL_API_KEY` 校验）；`quota_exceeded/tool_denied/prompt_injection/pii_filtered` 四类事件全接入；Agent `audit_client` HTTP 回写 |

---

## Phase 7-5：成本 & 性能反馈环（目标 5，P2）

**整体：⬜ 未开始**（预估 0.5 天，前置依赖 Phase 7-2 Models 单价已配）

| 步骤 | 描述 | 状态 | 完成时间 | 备注 |
|------|------|------|----------|------|
| 7-5-1 | 成本优化 Playbook 文档 | ⬜ | | 新增 `docs/monitor/COST_OPTIMIZATION_PLAYBOOK.md`；候选优化项 + 预期降本幅度 + 风险等级 + 监控指标；**v1 不实施**任何具体优化动作 |

---

## DoD 验收清单（全 19 个 prompt 完成后做最终验证）

每条来自 `1.PRD.md` §8，需在所有 Phase 完成后逐条勾选：

| # | 完成定义 | 状态 | 验收方法 |
|---|---|------|----------|
| DoD-1 | trace 闭环 | ⬜ | 前端 → LangSmith 看到完整 chat_node → tool_call → tool_result 链路 |
| DoD-2 | bad case 入库 | ⬜ | 前端 👎 → 24 秒内 LangSmith Dataset `plan2code-bad-cases-v1` 可见 |
| DoD-3 | eval 跑分 | ✅ | `pnpm eval:run -- --dataset bad --baseline <name>` 输出新旧对比表 |
| DoD-4 | guardrails 拦截 | ✅ | 四类命中事件落 `audit_logs`；配额超限返回 429；`trace_id` 可与 LangSmith metadata 串通 |
| DoD-5 | 成本看板 | ✅ | LangSmith Dashboard `plan2code-cost-overview` 6 卡片有真实数据 |
| DoD-6 | Cursor 自动加载 | ⬜ | 新开 Cursor 窗口输入"做 monitor phase-2 step-3"，无需手动 @ |

---

## 已知问题

<!-- 在这里记录发现的 bug 或待解决的问题。每条带日期 + trace_id（如适用）。 -->

（暂无）

---

## 变更记录

| 日期 | 变更内容 |
|------|----------|
| 2026-05-13 | Phase 7-0 启动；`REQUIREMENTS.md` v0.3 READY；`1.PRD.md` / `2.TECH_SELECTION.md` / `3.ARCHITECTURE.md` / `4.ARCHITECTURE_FOR_AI.md` / `PROGRESS.md` 5 份核心文档完成 |
| 2026-05-14 | Phase 7-2 完成：`7-2-3` 看板配置已完成，`plan2code-cost-overview` 上线并在 `USER_GUIDE.md` 沉淀入口；`DoD-5` 标记为 ✅ |
| 2026-05-14 | Phase 7-4 完成：`7-4-5` 审计日志落库完成（Backend `audit_logs` DAO + internal API + Quota/ACL 接入，Agent `audit_client` 回写）；`DoD-4` 标记为 ✅ |
