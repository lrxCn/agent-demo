# plan2code 监控 / 可观测 / Eval / 安全边界 / 成本优化体系（Phase 7）

> 一页纸入口。所有详细文档都在本目录下。

**状态**：📋 v1 规划完成（2026-05-13），等待 Phase 7-1 ~ 7-5 实施
**版本**：v1（与 `REQUIREMENTS.md` v0.3 对齐）
**预估总工期**：6.5 个工程日

---

## 一句话定位

> 一个 LangSmith Cloud 看板看穿全部 AI 链路 + 一条 trace_id 串前后三端 + 一套 bad case → eval 闭环 + 一层 30 行 Python 守住的安全边界 + 一份《成本优化 Playbook》形成"看-改-再看"反馈环。

**不破坏现有 Phase 0–6 任何代码**，自研代码总量 < 800 行，**Backend / Frontend 零新增依赖**。

---

## 9 份核心文档索引

按"你是谁 / 想干啥"对号入座：

| 我是 | 我想 | 应读 |
|---|---|---|
| 项目持有人 / 接手者 | 快速了解整体设计 | 本文件 → `1.PRD.md` § 5 |
| AI 助手 / Cursor | 拿到任务后的元指令 | `REQUIREMENTS.md`（必读）|
| AI 助手 / Cursor | 吃完整上下文 | `4.ARCHITECTURE_FOR_AI.md`（纯文字版）|
| 工程师（建设期）| 用 Cursor 把它建起来 | `DEVELOPER_GUIDE.md` |
| 工程师（使用期）| 日常巡检 / 查 bad case / 跑 eval | `USER_GUIDE.md` |
| 评审人 | 看选型理由 | `2.TECH_SELECTION.md` |
| 评审人 | 看拓扑图（一张 ASCII） | `3.ARCHITECTURE.md` § 2 |
| 任何人 | 看现在做到哪一步 | `PROGRESS.md`（接力棒）|

### 完整文档清单

| 文件 | 角色 | 行数 | 简述 |
|---|---|---|---|
| `README.md` | 入口 | 本文件 | 一页纸索引 |
| `REQUIREMENTS.md` | 元需求 | 360 | 任务输入 + 12 项已决策事项 + §8.1 不做清单（**已 READY，禁止覆盖**）|
| `1.PRD.md` | PRD | 450 | 5 大目标 + 66 个 ⬜ 验收项 + DoD 6 条 |
| `2.TECH_SELECTION.md` | 选型 | 530 | 社区方案矩阵 + 14 条显式拒绝清单 + 迁移工作量分析 |
| `3.ARCHITECTURE.md` | 架构（人类） | 630 | **唯一一张 ASCII 架构图** + 9 个 ★ 叠加点 + 4 条数据流 |
| `4.ARCHITECTURE_FOR_AI.md` | 架构（AI）| 430 | 纯文字版本，Cursor 自动加载用 |
| `PROGRESS.md` | 接力棒 | 140 | 仿 `docs/PROJECT_STATUS.md` 格式，每个 prompt 一行 |
| `DEVELOPER_GUIDE.md` | 建设期手册 | 430 | 10 个实用技巧 + 10 个 FAQ + 标准三步执行法 |
| `USER_GUIDE.md` | 使用期手册 | 360 | 每日 5 分钟巡检 + bad case 闭环 + 成本降本 SOP |
| `COST_OPTIMIZATION_PLAYBOOK.md` | 候选优化清单 | 待 Phase 7-5 产出 | 成本优化候选项 + 预期降本 + 风险 |
| `prompts/phase-N-*/step-M-*.md` | 分步 prompt | 19 个 | 给 Cursor 一次粘贴一个，原子级执行 |

---

## 5 个 Phase 一句话总览

| Phase | 目标 | 优先级 | 工期 | 状态 |
|---|---|---|---|---|
| **7-1 Trace** | W3C `traceparent` 透传 + LangSmith trace + 结构化日志 | P0 基石 | 1.5 d | ⬜ |
| **7-2 Observability** | LangSmith Models 单价 + Dashboard 6 卡片 | P0 | 0.5 d | ⬜ |
| **7-3 Eval** | 反馈 UI + Dataset 推送 + `pnpm eval:run` + Kimi-K2.6 评估 | P1 | 2 d | ⬜ |
| **7-4 Guardrails** | 配额 → 工具白名单 → 输入 filter → 输出 PII → 审计落 SQLite | P1 | 2.5 d | ⬜ |
| **7-5 Cost Playbook** | 成本优化候选项 Markdown | P2 | 0.5 d | ⬜ |

详细计划见 `PROGRESS.md`。Phase 间依赖见 `DEVELOPER_GUIDE.md` § 6。

---

## 12 项关键决策（来自 `REQUIREMENTS.md` § 8）

|  | 决策 |
|---|---|
| 看板平台 | **LangSmith Cloud SaaS**（不自托管 Langfuse）|
| 看板形态 | **只用 LangSmith 网页**，零前端自研看板 |
| 告警 | **v1 完全不做** |
| bad case 落库 | **直接推 LangSmith Dataset**（不双写 SQLite）|
| 离线 eval | 不支持 |
| eval 触发 | **仅手动 CLI**（不集成 CI）|
| 成本计算 | **LangSmith Models 单价 + 手工填**（不自研）|
| Guardrails | **自研 30 行**（不引入 NeMo / Llama Guard）|
| Phase 7-4 顺序 | 配额 → 工具白名单 → 输入 filter → 输出 PII → 审计（**顺序锁死**）|
| trace 标准 | **W3C Trace Context** |
| 多租户 | v1 不考虑 |
| 数据库 | **零新增**（audit 落 SQLite）|

---

## 快速开始（按角色）

### 我是建设者，今天就要开始

```bash
# 1. 读完前置文档（约 25 分钟）
open docs/monitor/REQUIREMENTS.md
open docs/monitor/1.PRD.md
open docs/monitor/3.ARCHITECTURE.md
open docs/monitor/DEVELOPER_GUIDE.md

# 2. 确认环境
redis-cli ping
curl http://localhost:6333/healthz
grep LANGSMITH_API_KEY .env

# 3. 启动开发期 LangGraph（注意端口 8123）
cd packages/agent && uv run langgraph dev --port 8123

# 4. 在 LangSmith Web 看到 plan2code-agent project 出现
# 5. 新开 Cursor 会话，粘贴 prompts/phase-1-trace/step-1-langsmith-setup.md 全文
```

### 我是日常使用者，体系已经建好

```bash
# 每天 5 分钟巡检（详见 USER_GUIDE.md § 0）
open https://smith.langchain.com    # 看 trace 数 / error rate / 看板
sqlite3 packages/backend/data/agent-demo.db \
  "SELECT event_type,COUNT(*) FROM audit_logs \
   WHERE created_at > date('now') GROUP BY event_type;"

# 跑一次 eval 对比
pnpm eval:run --dataset plan2code-bad-cases-v1 --baseline <上次实验名>
```

### 我是 AI 助手，刚接到任务

读这 3 份文件即可拿到全部上下文：

1. `@docs/monitor/REQUIREMENTS.md`（元需求 + 已决策事项）
2. `@docs/monitor/4.ARCHITECTURE_FOR_AI.md`（纯文字架构）
3. `@docs/monitor/PROGRESS.md`（当前进度）

然后找用户指定的 `@docs/monitor/prompts/phase-N-*/step-M-*.md` 执行。

---

## 与项目其他文档的关系

| 项目级 | 监控级（本目录）|
|---|---|
| `docs/ARCHITECTURE.md` / `ARCHITECTURE_FOR_AI.md` | `3.ARCHITECTURE.md` / `4.ARCHITECTURE_FOR_AI.md`（**叠加**，不重写）|
| `docs/PROJECT_STATUS.md` | `PROGRESS.md`（**Phase 7 接力棒，单行指向**，避免冲突）|
| `docs/API_CONTRACTS.md` | 新增条目见 `1.PRD.md` § 7（实施时同步追加到项目级 `API_CONTRACTS.md`）|
| `docs/CURSOR_MAINTENANCE_GUIDE.md` | `DEVELOPER_GUIDE.md`（**操作手册级**，不重复方法论）|
| `docs/META_PROMPT_FOR_PLANNING.md` | `prompts/` 目录（**复用其分步 prompt 范式**）|
| `.cursorrules` / `.cursor/rules/` | 新增 `.cursor/rules/05-monitoring-context.mdc`（Phase 7-0 实施时产出）|

---

## 变更记录

| 日期 | 变更 |
|---|---|
| 2026-05-13 | v1 规划完成：9 份核心文档全部产出，等待 Phase 7-1 ~ 7-5 实施。 |
