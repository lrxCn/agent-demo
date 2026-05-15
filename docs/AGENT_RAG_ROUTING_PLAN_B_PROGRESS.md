# Phase 8 进度追踪（Agent RAG 路由方案 B 接力棒）

> 这个文件是 **Phase 8（Agent RAG 路由强约束）** 的接力棒。每完成一个 step **必须**更新对应行状态。
>
> 新开 Cursor 会话时，让它先读这 4 份文件了解上下文：
>
> 1. `@docs/AGENT_RAG_ROUTING_PLAN_B_REQUIREMENTS.md` — 元需求 + 验收
> 2. `@docs/AGENT_RAG_ROUTING_PLAN_B_ARCHITECTURE.md` — 改造后架构（图、状态、开关）
> 3. **本文件** — 当前进度（看做到第几步）
> 4. 当前要执行的 prompt：`@prompts/phase-8/step-N-*.md`
>
> 旧项目级文档按需读：`@docs/ARCHITECTURE_FOR_AI.md` / `@docs/ARCHITECTURE.md` / `@docs/API_CONTRACTS.md`。

---

## 状态标记

- ⬜ 未开始
- 🔄 进行中
- ✅ 已完成
- ❌ 有问题需修复

---

## Phase 8 总进度

**整体：🔄 进行中**（预估 1.5 ~ 2 天，纯 Agent 图层改造，前后端零变更）

| 步骤 | 描述 | 状态 | 完成时间 | Prompt 文件 | 主要产出 |
|------|------|------|----------|-------------|----------|
| 8-1 | State 字段 + 环境变量开关 | ✅ | 2026-05-15 | `@prompts/phase-8/step-1-state-and-flag.md` | `state.py` 新增 `intent_route` / `forced_kb_results`（NotRequired）；`settings.py` 读取 `AGENT_RAG_ROUTER_ENABLED`；`.env.example` 默认 `true` |
| 8-2 | 意图路由 `intent_router`（规则法 + 单测） | ✅ | 2026-05-15 | `@prompts/phase-8/step-2-intent-router.md` | 新增 `graph/intent_router.py` + `tests/graph/test_intent_router.py`，18 个断言通过 |
| 8-3 | RAG 强制检索节点 `kb_query_node`（超时护栏 + 单测） | ⬜ | | `@prompts/phase-8/step-3-kb-query-node.md` | 新增 `graph/kb_query_node.py` + `tests/graph/test_kb_query_node.py` |
| 8-4 | builder 接线 + `chat_node` 消费 `forced_kb_results` | ⬜ | | `@prompts/phase-8/step-4-builder-and-chat.md` | `builder.py` 接入路由；`nodes.py` 注入 SystemMessage |
| 8-5 | LangSmith metadata/tags + 三组回归用例验证 | ⬜ | | `@prompts/phase-8/step-5-trace-and-regression.md` | trace tag `route:intent=*` / `route:kb_forced=*`；三组用例 LangSmith 验收 |

---

## 验收门槛（DoD）

来自 `REQUIREMENTS.md` §6：

### 6.1 功能验收（端到端 LangSmith trace）

- [ ] 「给我陈可新的信息」→ `route:intent=kb_query` + `route:kb_forced=true` + `rag:hit\|miss` tag
- [ ] 「打开学生管理页面」→ `route:intent=chat_direct` + `route:kb_forced=false`，且 `navigate_to_page` 工具被调用
- [ ] 「陈可新是谁？并帮我打开学生页」→ 先 `route:intent=kb_query`，后续轮次 `navigate_to_page` 才执行

### 6.2 回归验收

- [ ] `tools → after_tools → fallback` 链路行为与改造前一致（用 Phase 7-3 eval dataset 跑一遍）
- [ ] Guardrails（quota / tool_acl / prompt_injection / pii_filtered）四类事件仍正常落 `audit_logs`
- [ ] LangSmith Filter `tags has "rag:hit"` / `tags has "rag:miss"` 仍可命中

### 6.3 指标验收（启用一天后）

- [ ] LangSmith Filter `tags has "route:intent=kb_query"` 中，`tags has "route:kb_forced=true"` 比例 ≥ 95%
- [ ] 「未检索先导航」比例 < 5%（人工抽样 trace）

### 6.4 回滚验证

- [ ] `AGENT_RAG_ROUTER_ENABLED=false` 重启 Agent 后，trace 不再出现 `route:intent=*` tag
- [ ] CLI 模式 `pnpm dev:agentLocal` 与 `langgraph dev` 两种启动方式均工作正常

---

## 已知风险与对策（从 REQUIREMENTS.md §8 抄录）

| 风险 | 对策 |
|---|---|
| 关键词规则首版可能误判，造成不必要检索 | 先收敛词表只命中明确意图；可观测后逐步扩；指标 < 5% 误检率作为门槛 |
| 新增节点拉长链路时延 | `kb_query_node` 仅一次 retriever 调用；并加 10s `node_timeout_guard` 兜底 |
| 多轮对话下 `intent_router` 误把工具反馈也当用户问句 | 严格只取 `state.messages` 中最近一条 `HumanMessage` |
| LangSmith 上 tag 重复污染（与 Phase 7-2-2 的 rag tag 冲突）| `kb_query_node` 不重复打 `rag:*`，只让原有 `chat_node` / `tool_node_with_retry` 保留 |

---

## 不在本期做（与 ARCHITECTURE §9 一致）

- ❌ 训练意图分类小模型 / 接 BERT
- ❌ 修改 `search_knowledge_base` 工具 schema
- ❌ 重构 `tool_node_with_retry` / `after_tools` / `fallback_node`
- ❌ 引入新依赖（jieba、pkuseg 等分词库）
- ❌ 修改前端 / 后端 API 契约
- ❌ 新增 LangSmith Dashboard 卡片（用 Filter 即可）

---

## 变更记录

| 日期 | 步骤 | 变更内容 |
|------|------|----------|
| 2026-05-15 | 8-0 | Phase 8 文档产出：REQUIREMENTS / ARCHITECTURE / PROGRESS / HOW_TO_USE 四份文档 + `prompts/phase-8/step-1 ~ step-5` 五个原子 prompt + `.cursor/rules/06-rag-routing-context.mdc` 自动加载规则 + `.cursorrules` 追加 Phase 8 段 |
| 2026-05-15 | 8-1 | 完成 Step 1：`state.py` 新增 `intent_route` / `forced_kb_results`（NotRequired）；`settings.py` 新增 `AGENT_RAG_ROUTER_ENABLED`（默认 true）；`.env.example` 新增开关示例。 |
| 2026-05-15 | 8-2 | 完成 Step 2：新增 `intent_router`（规则法，信息查询优先）；新增 `tests/graph/test_intent_router.py`（18 个断言全通过）。 |
| | | （后续每个 step 完成后追加一行） |

---

## git commit 规范（建议）

每个 step 完成后建议单独 commit，commit message 末尾追加 `ref: docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md 8-N`：

```bash
git add packages/agent/src/graph/state.py docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md
git commit -m "$(cat <<'EOF'
feat(agent): phase-8 step-1 新增意图路由 state 字段与开关

- state.py 增加 intent_route / forced_kb_results NotRequired 字段
- settings.py 读 AGENT_RAG_ROUTER_ENABLED 默认 true
- .env.example 增加默认开关
- DoD: 旧 invoke 不带新字段仍可正常运行

ref: docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md 8-1
EOF
)"
```
