# 监控体系开发者操作手册（与 Cursor 配合 build 一遍）

> **文档目的**：手把手教开发者**用 Cursor 把 Phase 7-1 ~ 7-5 跑完**。这是"建设期"指南，**不是"使用期"指南**——建成后日常使用看看板 / 跑 eval / 看告警的步骤在 `USER_GUIDE.md`。
>
> **读者**：第一次接手这套监控体系的工程师；以及未来想增量加 phase / 加 step 的人。
>
> **前置阅读**：本文不重复 `docs/CURSOR_MAINTENANCE_GUIDE.md`（项目级 Cursor 方法论），只补充"监控体系特有"的操作。

---

## 目录

- [0. 你需要准备好的环境](#0-你需要准备好的环境)
- [1. 一次完整的 Phase 7-1 ~ 7-5 标准执行流程](#1-一次完整的-phase-7-1--7-5-标准执行流程)
- [2. 每个 prompt 的"标准三步执行法"](#2-每个-prompt-的标准三步执行法)
- [3. Cursor 自动加载机制详解](#3-cursor-自动加载机制详解)
- [4. 10 个实用技巧](#4-10-个实用技巧)
- [5. 常见问题 FAQ](#5-常见问题-faq)
- [6. Phase 间的依赖关系](#6-phase-间的依赖关系)
- [7. 验证失败时的回退策略](#7-验证失败时的回退策略)
- [8. 变更记录](#8-变更记录)

---

## 0. 你需要准备好的环境

### 0.1 必读文档（按顺序）

第一次接手时按下面顺序读一遍，每份大约 5 分钟：

1. `@docs/ARCHITECTURE_FOR_AI.md` — 既有系统拓扑（人类也可读，比 `ARCHITECTURE.md` 更紧凑）
2. `@docs/monitor/REQUIREMENTS.md` — 元需求 + 12 项已决策事项 + 不做清单
3. `@docs/monitor/1.PRD.md` — 5 大目标 + 66 个 ⬜ 验收点
4. `@docs/monitor/3.ARCHITECTURE.md` — 一张 ASCII 图秒懂 9 个叠加点
5. `@docs/monitor/PROGRESS.md` — 当前进度

> 这 5 份文档加起来约 25 分钟读完。**不要跳读**，否则后面 prompt 执行时 Cursor 容易胡乱发挥。

### 0.2 LangSmith 账号

- 登录 https://smith.langchain.com → Settings → API Keys 创建一个 personal key
- 复制到本项目 `.env` 的 `LANGSMITH_API_KEY`（应该已存在，确认非占位值即可）
- 检查 `.env` 的 4 个 `LANGCHAIN_*` 变量齐全（参考 `4.ARCHITECTURE_FOR_AI.md` §9）

### 0.3 本机服务

确认以下服务已起来（Phase 0–6 完成后默认应该都有）：

```bash
# Redis（短期记忆 + 配额计数器）
redis-cli ping
# 期望输出：PONG

# Qdrant（向量库）
curl http://localhost:6333/healthz
# 期望输出：healthz check passed

# SiliconFlow API（主 LLM + LLM-as-judge + embedding + rerank）
echo "通过 .env 中的 OPENAI_API_KEY + OPENAI_BASE_URL 调用，无需独立验证"
```

### 0.4 启动开发期 LangGraph

监控体系开发期统一使用：

```bash
cd packages/agent
uv run langgraph dev --port 8123
```

⚠️ **注意端口 8123**（与 `.env` 的 `LANGGRAPH_API_URL=http://localhost:8123` 对齐）。`langgraph dev` 默认是 2024 端口，**必须显式 `--port 8123` 覆盖**。

启动成功后：
- Studio UI：`http://localhost:8123/studio`
- 在浏览器打开 https://smith.langchain.com → Projects → 应当出现 `plan2code-agent`（或你 `.env` 改的本地名）

---

## 1. 一次完整的 Phase 7-1 ~ 7-5 标准执行流程

监控体系建设的"鸟瞰视角"：

```
Phase 7-1 (Trace)        ──┐
                            ├──► 必须先做（其他 phase 都依赖 trace_id）
                            ┘
Phase 7-2 (Observability) ──┐
                            ├──► 与 7-1 紧贴，让监控真的"有人看"
                            ┘
Phase 7-3 (Eval)          ──┐
                            ├──► 可与 7-4 并行
Phase 7-4 (Guardrails)    ──┘    （但 7-4 内部 5 个 step 严格顺序）

Phase 7-5 (Cost Playbook) ──► 最后做，只是文档，无代码
```

预估总时长：**6.5 个工程日**（详见 `1.PRD.md` §2）。建议节奏：

| 工作日 | 完成项 |
|---|---|
| Day 1 上午 | Phase 7-1 step-1 ~ step-3（LangSmith 启用 + 前后端 trace 注入） |
| Day 1 下午 | Phase 7-1 step-4 + step-5（Agent metadata + 端到端验证） |
| Day 2 上午 | Phase 7-2 全部 3 步（LangSmith Web 配置） |
| Day 2 下午 | Phase 7-3 step-1（Eval Runner） |
| Day 3 | Phase 7-3 step-2 ~ step-5（前后端反馈 + dataset + diff） |
| Day 4 上午 | Phase 7-4 step-1 + step-2（配额 + 工具白名单） |
| Day 4 下午 | Phase 7-4 step-3 + step-4（input/output filter） |
| Day 5 上午 | Phase 7-4 step-5（审计日志） |
| Day 5 下午 | Phase 7-5 Cost Playbook + DoD 全量验收 |

---

## 2. 每个 prompt 的"标准三步执行法"

每个 `docs/monitor/prompts/phase-N-*/step-M-*.md` 都按以下流程跑：

### 步骤 A：新开 Cursor 会话

**不要在写完一个 step 的同一个会话继续做下一个**。新会话能：
- 切断上一个 step 的上下文污染
- 让 `.cursor/rules/05-monitoring-context.mdc` 重新生效
- 自动加载 `PROGRESS.md` 当前进度

### 步骤 B：把 prompt 文件原文粘进对话框

不要复述、不要总结。**整段复制粘贴**。Cursor 看到 `@文件路径` 引用会自动拉上下文。

完整模板：

```
请执行 @docs/monitor/prompts/phase-1-trace/step-2-frontend-trace-id.md
```

或者直接粘贴文件内容：

```
[复制 step-2-frontend-trace-id.md 的全部内容]
```

### 步骤 C：验证 → 更新进度

Cursor 执行完后必然有"验证"小节。**自己跑一遍验证命令 / 浏览器操作**，确认通过后：

1. 打开 `docs/monitor/PROGRESS.md`
2. 把该步骤的 ⬜ 改为 ✅
3. 填上"完成时间"列（今天的日期）
4. 必要时填"备注"列（实际遇到的坑）

⚠️ **关键纪律**：**验证不通过不要标 ✅**。哪怕只差一个小细节，标 🔄 或 ❌，等修好再升级。

### 步骤 D（可选）：提交 git commit

每个 step 完成后建议 git commit 一次。commit 消息格式：

```
feat(monitor): phase-7-1 step-2 frontend trace_id 注入

- 新增 src/utils/trace.ts (W3C traceparent 生成器)
- axios 拦截器自动注入 traceparent header
- useChat.ts 解析 SSE {type:'trace'} 缓存 langsmith_run_id
- DoD: 前端 console 可见 trace_id

ref: docs/monitor/PROGRESS.md 7-1-2
```

---

## 3. Cursor 自动加载机制详解

监控体系建好后，你新开 Cursor 窗口输入"帮我做 monitor phase-2 step-3"，Cursor 应该**自动**做到：

- 读 `docs/monitor/REQUIREMENTS.md`（不用 @）
- 读 `docs/monitor/PROGRESS.md`（不用 @）
- 读 `docs/monitor/3.ARCHITECTURE.md`（不用 @）
- 找到对应的 `docs/monitor/prompts/phase-2-*/step-3-*.md`（不用 @）

这套机制由 4 个文件共同实现：

### 3.1 `.cursor/rules/05-monitoring-context.mdc`（glob 触发）

文件位置：`.cursor/rules/05-monitoring-context.mdc`

```yaml
---
description: 监控/可观测/eval/边界/成本 体系的上下文规则
globs: "docs/monitor/**,packages/*/src/**/observability/**,packages/*/src/**/guardrails/**,packages/*/src/**/eval/**"
alwaysApply: false
---

# 监控体系开发规范

- 任何涉及 trace、observability、eval、guardrails、cost、bad case 的任务，
  必须先阅读：
  - @docs/monitor/REQUIREMENTS.md（需求规格）
  - @docs/monitor/PROGRESS.md（当前进度，接力棒）
  - @docs/monitor/3.ARCHITECTURE.md（监控架构 + 一张 ASCII 图）

- 社区方案优先级：LangSmith > Langfuse > Arize Phoenix > OTel > 自研

- 修改埋点 / guardrails / eval 时，必须在 PROGRESS.md 中把对应 ⬜ 改为 ✅
```

**触发条件**：当你在对话里 @ 了 `docs/monitor/` 或任意 `observability/`/`guardrails/`/`eval/` 路径下的文件时，本规则自动加载。

### 3.2 `.cursorrules`（项目全局，每次会话隐式加载）

在 `.cursorrules` 末尾追加：

```markdown
# 监控体系开发约定（docs/monitor/）

- 任何涉及 trace、可观测、eval、安全边界、成本优化的任务，必须先读：
  - @docs/monitor/REQUIREMENTS.md
  - @docs/monitor/PROGRESS.md

- 进度同步：每完成一个 prompt 后，立刻把 @docs/monitor/PROGRESS.md 对应项标记为 ✅

- 工程约定：埋点统一走 packages/*/src/observability/，
            guardrails 统一走 packages/*/src/guardrails/，
            eval 统一走 packages/agent/src/eval/
```

### 3.3 `.cursorignore`（不要污染索引）

在 `.cursorignore` 末尾追加：

```
docs/monitor/prompts/
```

理由：prompt 文件是"给人复制粘贴用的"，不是源代码。如果让 Cursor 索引，反而会在你问其他问题时被"召回"，造成上下文噪音。

### 3.4 `docs/PROJECT_STATUS.md`（指向监控进度）

在末尾追加一节：

```markdown
## Phase 7: 监控与运维体系

详见 @docs/monitor/PROGRESS.md
```

避免两个进度文件冲突。

---

## 4. 10 个实用技巧

### 技巧 1：让 Cursor 在新会话开头自我确认

在新开会话执行 prompt 前，先问一次：

> 请确认你已经读过 @docs/monitor/REQUIREMENTS.md、@docs/monitor/PROGRESS.md、@docs/monitor/3.ARCHITECTURE.md，并告诉我当前 PROGRESS.md 上还有几个 ⬜ 状态。

如果 Cursor 答不出来或答错数字，说明它没真读，立即提醒并重新加载。

### 技巧 2：让 Cursor 跑前先列文件清单

prompt 执行前问 Cursor：

> 在动手前，请列出本步骤要新增 / 修改的所有文件路径，等我确认后再写代码。

这能避免它"顺手"改了不该改的文件（破坏 `3.ARCHITECTURE.md` §8 "零重构"承诺）。

### 技巧 3：trace_id 在浏览器看不到怎么排查

按 §5 FAQ "Q1" 处理。

### 技巧 4：用 `git diff packages/agent/src/graph/` 守住"内部增强"边界

每次 Cursor 改完 `nodes.py` / `state.py`，跑一遍：

```bash
git diff packages/agent/src/graph/ | head -100
```

如果发现它改了节点拓扑（`builder.py`）或新增了节点函数，**立即 `git restore` 该文件**，重新精确指令"只改 `chat_node` 内部"。

### 技巧 5：LangSmith 看板出不来数据 → 不是没埋点，多半是 project 名错了

去 LangSmith Web → Projects 查 `.env` 中的 `LANGCHAIN_PROJECT` 是否在列表中。常见错误：本地改了 project 名但 LangGraph 进程还是旧 env（**`langgraph dev` 不会热加载 `.env`，改完必须重启**）。

### 技巧 6：guardrails YAML 改完没生效 → 重启 Agent

v1 不实现文件 watcher，YAML 是启动时读的。改完 `blacklist.yaml` / `sensitive.yaml` 必须 `Ctrl+C` 重启 `uv run langgraph dev`。

### 技巧 7：`pnpm eval:run` 第一次跑会很慢

正常。LangSmith dataset 拉取 + Ragas 评估器初始化都需要冷启动几十秒。第二次会快很多（LangSmith client 单例 + Ragas 模型 cache）。

### 技巧 8：让 Cursor 写完代码后顺手更新 `PROGRESS.md`

prompt 文件末尾都已经包含"更新 PROGRESS.md"的指令。但有时 Cursor 会忘。**养成习惯**：每次 Cursor 说"代码已写完"后，紧接着问：

> PROGRESS.md 对应行的 ⬜ 改 ✅ 了吗？把改后的内容贴出来。

### 技巧 9：单元测试用 `pytest -k <name>` 精确跑

guardrails 单元测试位置：`packages/agent/tests/guardrails/`。跑某一个：

```bash
cd packages/agent
uv run pytest tests/guardrails/test_input_filter.py -k injection -v
```

### 技巧 10：让 Cursor 自我审查"零重构"承诺

每个 step 收尾时问 Cursor：

> 请对照 @docs/monitor/3.ARCHITECTURE.md §8 "不修改的文件清单"，逐个检查本次改动有没有越界？如果有，请给出 git restore 命令。

这是兜底防线。

---

## 5. 常见问题 FAQ

### Q1：前端 console 看不到 `trace_id`，浏览器 Network 里 traceparent header 是空的

**排查顺序**：

1. 浏览器开 DevTools → Network → 找到 `/api/v1/agent/chat` 请求 → Headers → Request Headers 看 `traceparent` 是否真的发出去了。如果没发出，说明 axios 拦截器没生效，检查 `src/api/request.ts` 是否 import 了 `trace.ts`。
2. 如果 header 发出去了但后端日志没 trace_id，检查 NestJS 全局 Interceptor 是否注册（`app.module.ts` 的 `providers` 里有 `TraceInterceptor`）。
3. 如果后端日志有 trace_id 但 LangSmith metadata 没，检查 `chat_node` 里 `RunTree.add_metadata` 是否被调用（最容易踩的坑：`langgraph dev` 模式下 `get_current_run_tree()` 可能返回 `None`，需要做 None 判空）。

### Q2：LangSmith Dataset 推送返回 404

LangSmith dataset 默认不存在。要么先在 Web UI 手动建 3 个 dataset（`plan2code-bad-cases-v1` / `plan2code-rag-cases-v1` / `plan2code-tool-cases-v1`），要么改 `FeedbackService` 让它"create if not exists"（推荐后者，已在 prompt step 中写好）。

### Q3：`pnpm eval:run` 报错 "OPENAI_LLM_AS_JUDGE not set"

检查 `.env` 第 11 行是否有 `OPENAI_LLM_AS_JUDGE=Pro/moonshotai/Kimi-K2.6`。检查 `packages/agent/src/config/settings.py` 是否读取了这个变量。**不要硬编码模型名到 `runner.py` 里**。

### Q4：审计日志写不进 SQLite

排查：

1. `INTERNAL_API_KEY` header 是否一致？Agent 端 `audit_client.py` 和 Backend `.env` 必须用同一个值。
2. `IAuditLogDao` 是否在 `dao.module.ts` 中通过 provide token 绑定了 SQLite 实现？
3. SQLite 表是否真的建了？运行：

   ```bash
   sqlite3 packages/backend/data/agent-demo.db ".schema audit_logs"
   ```

   如果空，说明 TypeORM `synchronize: true` 没触发，重启后端。

### Q5：配额耗尽后用户被直接拒答，体验太差

按 `1.PRD.md` §10 "风险与降级策略"：

- 临时方案：调高 `.env` 的 `QUOTA_DAILY_TOKENS_PER_USER`
- 长期方案：v2 加"降级模型路由"（命中配额时切到更便宜的模型继续服务）

### Q6：我能不能跳过 Phase 7-1 直接做 Phase 7-3？

**不建议**。Phase 7-3 的反馈按钮需要 `langsmith_run_id`，这是 Phase 7-1 step-4 的产物。如果跳过，前端打 👎 后只能模糊匹配 thread，DoD-2 体验会差。

### Q7：Phase 7-2 的 Models 单价我到哪查 SiliconFlow 公开价？

去 https://siliconflow.cn/pricing → 找到对应模型行，把 ¥/1M token 数字除以 1,000,000 得到单 token 价格，按 LangSmith 要求的格式（USD 数字）填入。

> 详细操作步骤在 `USER_GUIDE.md` 里有截图占位 + 当前快照价格表。

### Q8：guardrails YAML 黑名单要不要从公开数据集导入？

v1 **不导入**。先用 10–20 条手写关键词覆盖最常见的 prompt-injection 套路。事后从审计日志统计 hit rate，hit 率低再扩充。直接导入大词库会显著抬高误杀率。

### Q9：我能在 Phase 7-4 step-3 之前先做 step-4 吗？

**不能**。`REQUIREMENTS.md` §8 决策 #9 锁定了 Phase 7-4 内部 5 个 step 的严格顺序：token 配额 → 工具白名单 → input filter → output filter → 审计日志。**审计日志是最后一步**，因为它需要前面 4 类事件都已经在产生。

### Q10：我做完了不打算用 Cursor 怎么办？

那 §3 的自动加载机制对你意义不大，但 `PROGRESS.md` 仍然有用——可以当一个普通的 markdown checklist 跟踪。

---

## 6. Phase 间的依赖关系

```
                              ┌──► Phase 7-2 (依赖 7-1 的 metadata)
                              │
Phase 7-1 (基石, 必须最先做) ──┼──► Phase 7-3 (依赖 7-1 的 trace_id + run_id 回流)
                              │
                              ├──► Phase 7-4 (依赖 7-1 的 trace_id 用于审计串联)
                              │
                              └──► Phase 7-5 (依赖 7-2 的 Models 单价配置)
```

- Phase 7-2 和 Phase 7-3 之间**可以并行**（不同人 / 不同时段）
- Phase 7-3 和 Phase 7-4 之间**可以并行**
- Phase 7-4 内部 5 个 step **必须串行**（顺序锁定，见 FAQ Q9）
- Phase 7-5 必须最后做（依赖 7-2 已经在 LangSmith 配好 Models 单价，否则 Playbook 里"预期降本幅度"无法对照）

---

## 7. 验证失败时的回退策略

每个 prompt 都有"验证"小节。如果验证失败：

### 7.1 Cursor 自我修复（首选）

把验证失败的现象（错误日志 / 浏览器截图 / 验证命令的实际输出）直接贴给 Cursor，附加：

> 请按 @docs/monitor/3.ARCHITECTURE.md §8 "零重构"承诺修复这个问题。

让它在原 step 范围内自查。**不要让它"扩大范围"**——如果它要求改 `auth/` 或 `student/` 等业务模块，立即打断。

### 7.2 Git 回退到上一个绿色 commit

如果 Cursor 修了两轮还不行，直接：

```bash
git stash    # 保留改动以备后续分析
git log --oneline -10
git checkout <上一个 ✅ commit>
```

然后**找一个清醒的人脑** 看看 prompt 文件本身有没有问题，必要时修订 prompt 再重跑。

### 7.3 标 ❌ 等下一轮

如果回退也搞不定，把 PROGRESS.md 对应行标 ❌，在"备注"列写明阻塞原因，跳过本 step 继续做无依赖的其他 step。事后再回头处理。**不要让一个失败 step 阻塞整个 Phase 7 的产出**。

---

## 8. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1 | 2026-05-13 | 首版。覆盖 Phase 7-1 ~ 7-5 全流程操作 + 10 个实用技巧 + 10 个 FAQ。 |
