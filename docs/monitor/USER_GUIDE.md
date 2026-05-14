# 监控体系使用手册（日常运维篇）

> **文档目的**：监控体系建成**之后**，开发者 / 项目持有人在日常工作中如何使用看板 / 跑 eval / 查 bad case / 看审计 / 做降本。
>
> **读者**：日常使用者（不是建设者）。建设期的"如何用 Cursor 把它建起来"在 `DEVELOPER_GUIDE.md`。
>
> **前置条件**：`PROGRESS.md` 中所有 Phase 7-1 ~ 7-5 标 ✅；DoD-1 ~ DoD-6 已通过。

---

## 目录

- [0. 你每天 5 分钟巡检脚本](#0-你每天-5-分钟巡检脚本)
- [1. 日常使用场景速查](#1-日常使用场景速查)
- [2. LangSmith 看板使用指南](#2-langsmith-看板使用指南)
- [3. Bad case 工作流](#3-bad-case-工作流)
- [4. Eval 跑分工作流](#4-eval-跑分工作流)
- [5. Guardrails 拦截事件查阅](#5-guardrails-拦截事件查阅)
- [6. 成本监控与降本动作](#6-成本监控与降本动作)
- [7. SiliconFlow 当前价格快照（LangSmith Models 配置参考）](#7-siliconflow-当前价格快照langsmith-models-配置参考)
- [8. 常见问题 FAQ](#8-常见问题-faq)
- [9. 变更记录](#9-变更记录)

---

## 0. 你每天 5 分钟巡检脚本

每天上班花 5 分钟跑一遍以下检查（v1 不做自动告警，靠人工巡检）：

| 时长 | 操作 | 期望状态 |
|---|---|---|
| 1 min | 打开 LangSmith Web → Projects → `plan2code-agent` | 昨日 trace 数 > 0 且**无 error rate 突增** |
| 1 min | 切到 Dashboard [`plan2code-cost-overview`](https://smith.langchain.com/o/46705a2-734a-4886-b1c9-d2e1e69b3ce0/dashboards) | 6 张卡片均显示数据；今日 token 趋势平稳 |
| 1 min | 看 Bad case 卡片 | 今日 👎 数量；若 > 5 应当点开看 |
| 1 min | 终端跑 `sqlite3 packages/backend/data/agent-demo.db "SELECT event_type, COUNT(*) FROM audit_logs WHERE created_at > date('now') GROUP BY event_type;"` | 看是否有异常拦截激增 |
| 1 min | 浏览器 Console 看前端报错；项目终端看后端 stderr | 无新增报错 |

发现异常 → 跳转到 §1 对应场景。

---

## 1. 日常使用场景速查

| 场景 | 跳转 |
|---|---|
| 用户反馈"AI 回答错了" → 我要定位到具体哪条 trace | §3.1 |
| 我改了一版 prompt 想看效果 | §4 |
| LangSmith 看板 cost 列显示 0 | §8 Q1 |
| 用户说"我被限流了" | §8 Q2 |
| 怀疑 prompt-injection 攻击 | §5.2 |
| 月底要降本 30% | §6.2 |
| 想换 LLM 模型省钱 | §6.3 |
| 想新增一个评估场景 | §4.4 |
| Cursor 突然不会自动加载监控规则 | §8 Q5 |

---

## 2. LangSmith 看板使用指南

### 2.1 打开看板

1. 访问 https://smith.langchain.com
2. 左侧菜单 → Projects → 点 `plan2code-agent`（或你 `.env` 中 `LANGCHAIN_PROJECT` 的本地名）
3. 顶部时间选择器：默认 Last 7 days，按需切

### 2.2 看 5 类核心指标

| 指标 | 在 LangSmith 哪里看 |
|---|---|
| **节点级耗时（chat_node / tool_node / fallback_node）** | Project 概览 → 下方"Top runs by latency"列表；或点 trace 详情看 span 时间条 |
| **错误率** | Project 概览 → 顶部 "Error Rate" 卡片 |
| **token 用量按 model 切分** | Dashboards → `plan2code-cost-overview` → 卡片 1 |
| **单次对话平均成本** | 同上 → 卡片 3 |
| **p50/p95/p99 延迟** | 同上 → 卡片 4 |

### 2.3 用 metadata / tag 切片业务维度

LangSmith Filter 语法：

| 想看 | Filter 写法 |
|---|---|
| 某个用户的所有 trace | `metadata.mem0_user_id = "<uuid>"` |
| 所有被踩的 trace | `tag = "feedback:down"` |
| 命中 prompt-injection 的 trace | `metadata.audit_event = "prompt_injection"` |
| 某个 trace_id（前端给你的） | `metadata.app_trace_id = "<32 hex>"` |
| 只看 RAG 命中的 | `tag = "rag:hit"` |

> 把以上常用 filter 保存为 LangSmith Saved Filter，下次一键还原。

### 2.4 看板异常处理 SOP

- **trace 数量为 0**：检查 `.env` 的 `LANGCHAIN_TRACING_V2=true`；检查 Agent 进程是否在跑（`ps -ef | grep langgraph`）；检查 `LANGCHAIN_PROJECT` 名字是否与 LangSmith 网页对得上。
- **error rate 突增**：点 Project 概览 → 按 latency 排序 → 看顶部红色 trace → 点开看 error span。
- **cost 列全 0**：去 §7 重新核对 Models 单价配置。

---

## 3. Bad case 工作流

### 3.1 用户投诉到落地修复（完整链路）

```
用户在前端聊天气泡发现错误回复
   │
   │ 点击该消息下方的 👎 按钮（输入备注可选）
   ▼
后端 FeedbackService 立即调 LangSmith REST：
   1) 打分（trace 上多 tag "feedback:down"）
   2) 入库（dataset plan2code-bad-cases-v1 多 1 条 example）
   ▼
你（开发者）打开 LangSmith → Datasets → plan2code-bad-cases-v1
   │ → 看最近 1 天新增的 examples
   ▼
对每条 bad case 分析：
   - 看 input.messages 找出用户原始诉求
   - 看 output 看 AI 错在哪里
   - 看 metadata.app_trace_id → 跳转到 Projects 查同一 trace 的完整 span
   ▼
判断是哪一类问题：
   ├─ prompt 不够清晰 → 改 system_prompt
   ├─ RAG 召回不准 → 改 retriever 的 query / 调 rerank top_k
   ├─ 工具调用错误 → 改 tool schema description
   └─ 模型本身能力弱 → 考虑切到更强模型
   ▼
改完代码，git commit
   ▼
跑 pnpm eval:run --dataset plan2code-bad-cases-v1 --baseline <上次实验名>
   │ → 终端看 diff 表
   ▼
确认 accuracy 提升后合并 PR
```

### 3.2 三个 dataset 的用途区分

| Dataset | 用途 | 例子 |
|---|---|---|
| `plan2code-bad-cases-v1` | 所有 👎 反馈，**通用 case 兜底** | 用户问"你是谁"答错；闲聊跑题 |
| `plan2code-rag-cases-v1` | 含 `search_knowledge_base` tool_call 的 case | "我们公司的考勤制度是什么"答非所问 |
| `plan2code-tool-cases-v1` | 含其他工具调用的 case | "帮我删掉张三"误删了李四 |

Dataset 自动路由由后端 `FeedbackService` 根据 trace 的 tool_calls 类型分发，**人工无需选择**。

---

## 4. Eval 跑分工作流

### 4.1 基本命令

```bash
# 在 monorepo 根目录
pnpm eval:run --dataset plan2code-bad-cases-v1

# 与上次 baseline 对比
pnpm eval:run --dataset plan2code-bad-cases-v1 --baseline experiment-2026-05-15-1430
```

### 4.2 终端输出解读

预期 stdout 格式：

```
[Eval Report]
Dataset:        plan2code-bad-cases-v1
Total examples: 47
Experiment:     plan2code-eval-2026-05-16-0930
Baseline:       experiment-2026-05-15-1430

| Metric            | Baseline | Current  | Δ        |
|-------------------|----------|----------|----------|
| accuracy          | 0.78     | 0.85     | +0.07 ✓ |
| tool_call_correct | 0.91     | 0.93     | +0.02 ✓ |
| rag_hit_rate      | 0.65     | 0.68     | +0.03 ✓ |
| avg_latency_ms    | 2840     | 3010     | +170 ✗  |
| avg_cost (¥)      | 0.0023   | 0.0025   | +0.0002 |

LangSmith Experiment: https://smith.langchain.com/...experiment/.../
```

- ✓ 表示改善
- ✗ 表示退化（如 latency 增加）
- 数值无标记表示变化在 ±5% 内（视为持平）

### 4.3 应该怎么解读

| 现象 | 解读 | 应对 |
|---|---|---|
| accuracy ↑ + cost 持平 | 纯收益，可合并 | 直接合 PR |
| accuracy ↑ + cost ↑ | 用钱换效果 | 评估值不值（cost 涨幅 / accuracy 涨幅 比例） |
| accuracy 持平 + cost ↓ | 降本动作有效 | 合并；做下一轮降本 |
| accuracy ↓ + cost ↓ | 降本过头了 | 回退或部分回退 |
| accuracy ↓ + cost 持平 | 改坏了 | 必须回退 |

### 4.4 想新增一个评估场景

例如：新增"通话记录查询场景"评估。步骤：

1. 在 LangSmith Web 新建一个 dataset `plan2code-calls-cases-v1`
2. 从 LangSmith Projects 中筛选 `tag = "tool:search_my_calls"` 的真实 trace，点击"Add to dataset"
3. 修改 `packages/agent/src/eval/runner.py` 的 dataset 路由表，注册新场景
4. （可选）新增一个 evaluator 在 `packages/agent/src/eval/evaluators/`
5. 跑 `pnpm eval:run --dataset plan2code-calls-cases-v1`

---

## 5. Guardrails 拦截事件查阅

### 5.1 查最近 24 小时的拦截事件

```bash
sqlite3 packages/backend/data/agent-demo.db <<SQL
SELECT
  event_type,
  severity,
  COUNT(*) AS hits,
  MAX(created_at) AS latest
FROM audit_logs
WHERE created_at > datetime('now', '-1 day')
GROUP BY event_type, severity
ORDER BY hits DESC;
SQL
```

### 5.2 怀疑被攻击时的查证步骤

1. 跑上面的命令，看 `prompt_injection` 类型当日是否激增。
2. 看具体 payload：

   ```bash
   sqlite3 packages/backend/data/agent-demo.db \
     "SELECT trace_id, user_id, payload_json, created_at \
      FROM audit_logs \
      WHERE event_type='prompt_injection' \
      ORDER BY created_at DESC LIMIT 20;"
   ```

3. 取出 `trace_id`，去 LangSmith UI 用 `metadata.app_trace_id = "<...>"` 反查整段对话。
4. 取出 `user_id`，去后端 `users` 表查这是谁，判断是测试用户还是真实攻击者。
5. 必要时：在 `packages/agent/guardrails/blacklist.yaml` 加入新发现的关键词，重启 Agent。

### 5.3 PII 命中事件查阅

```bash
sqlite3 packages/backend/data/agent-demo.db \
  "SELECT trace_id, payload_json FROM audit_logs WHERE event_type='pii_filtered' ORDER BY created_at DESC LIMIT 50;"
```

`payload_json` 中含 `pii_type`（`id_card` / `phone` / `email` / `bank_card`）和 `mask_count`，方便统计哪类 PII 最容易出现在 LLM 输出。

### 5.4 调整黑名单 / 敏感词

1. 编辑 `packages/agent/guardrails/blacklist.yaml`（prompt-injection 关键词）或 `sensitive.yaml`（输出敏感词）
2. **重启 LangGraph**（`Ctrl+C` 后重跑 `uv run langgraph dev --port 8123`）
3. 触发一次测试，再查 `audit_logs` 确认命中数变化

> v1 不实现文件 watcher 热重载，必须重启。详见 `DEVELOPER_GUIDE.md` §4 技巧 6。

---

## 6. 成本监控与降本动作

### 6.1 看当日成本

LangSmith Dashboard `plan2code-cost-overview` 的 6 张卡片：

1. **单日 token 消耗（按 model 切分）**：堆叠柱图
2. **Top 10 用户的 token 消耗**：横向条形图
3. **单次对话平均成本（数字单位 ¥）**：数字 + 7 日趋势
4. **p50/p95/p99 端到端延迟**：折线图
5. **RAG 命中率**：饼图（`rag:hit` vs `rag:miss`）
6. **Bad case 数量**：数字 + 7 日趋势

### 6.2 月底降本 30% 的标准动作清单

按 `docs/monitor/COST_OPTIMIZATION_PLAYBOOK.md` 中的优先级表（实施前**必先跑一次 eval 取 baseline**）：

| 顺序 | 动作 | 预期降本 | 风险 |
|---|---|---|---|
| 1 | 缩短 system prompt / 移除冗余示例 | 5–15% | 低 |
| 2 | 工具结果裁剪（截断长 JSON） | 5–20% | 低 |
| 3 | 增加 prompt cache（OpenAI 兼容头） | 10–30% | 低 |
| 4 | 改进 RAG 检索（减少召回数 / 改进 rerank） | 5–10% | 中 |
| 5 | 切换更便宜的模型路由 | 20–40% | 中 |

每完成一项，跑一次 `pnpm eval:run --baseline <上次>`，accuracy 不下降即可保留。

### 6.3 切换 LLM 模型省钱（高风险操作）

步骤：

1. 在 LangSmith Web → Settings → Models 给新模型先配单价（参考 §7）
2. 修改 `.env` 的 `OPENAI_MODEL_NAME`
3. 重启 Agent（`Ctrl+C` 后重跑）
4. **跑全量 eval**：`pnpm eval:run --dataset plan2code-bad-cases-v1` + `pnpm eval:run --dataset plan2code-rag-cases-v1` + `pnpm eval:run --dataset plan2code-tool-cases-v1`
5. 三套 accuracy 均不下降超过 5% → 保留新模型；否则回滚

⚠️ **不要在生产时段切换模型**。即使 demo 项目，至少留出 30 分钟回滚窗口。

---

## 7. SiliconFlow 当前价格快照（LangSmith Models 配置参考）

> 价格随时变动。配置前请先去 https://siliconflow.cn/pricing 核对最新值。
>
> 本表为 2026-05-14 查询快照。汇率按 `¥->USD = 6.7832`，换算口径：
> `LangSmith 单价(USD/token) = ¥/M tokens / 1_000_000 / 6.7832`。
>
> 注意：LangSmith `Model pricing` 页面实际录入的是 `USD / 1M tokens`。因此表中同时保留
> `USD/token`（用于审计复核）和 `USD/1M`（用于 UI 录入）两列。

| 模型 | 用途 | 输入（¥/M tokens） | 输出（¥/M tokens） | LangSmith Prompt（USD/token） | LangSmith Completion（USD/token） | LangSmith Prompt（USD/1M） | LangSmith Completion（USD/1M） |
|---|---|---|---|---|---|---|---|
| `Pro/deepseek-ai/DeepSeek-V3.2` | 主对话 | 2 | 3 | 0.0000002948 | 0.0000004422 | 0.2948 | 0.4422 |
| `Pro/moonshotai/Kimi-K2.6` | LLM-as-judge | 6.5 | 27 | 0.0000009582 | 0.0000039802 | 0.9582 | 3.9802 |
| `BAAI/bge-large-zh-v1.5` | embedding | 0 | 0 | 0 | 0 | 0 | 0 |
| `BAAI/bge-reranker-v2-m3` | rerank | 0 | 0 | 0 | 0 | 0 | 0 |

> 配置时请确保 LangSmith `Model Name / Match Pattern` 与运行时模型字符串严格一致，避免 cost 回落为 `--` 或 `0`。

### 7.1 配置步骤

1. 登录 LangSmith Web
2. 右上角头像 → Settings
3. 左侧菜单 → Models
4. 点 "Add Model" → 输入 4 项（`Model Name`、`Input Price`、`Output Price`、`Provider`；`Provider` 选 `openai`，因为 SiliconFlow 走 OpenAI 兼容协议）
5. `Model Name` 或 `Match Pattern` 必须与实际模型字符串完全一致（如 `Pro/deepseek-ai/DeepSeek-V3.2`），否则 LangSmith 匹配不上

### 7.2 验证配置生效

配置后触发一次对话 → 去 LangSmith UI 看 trace 详情 → "Total cost" 字段不再为 0 即生效。如果还是 0，多半是模型名拼写不一致。

---

## 8. 常见问题 FAQ

### Q1：LangSmith trace cost 列全是 0

**99% 的可能性**：LangSmith Settings → Models 里**模型名拼写不匹配**。常见错误：

- 配的是 `deepseek-V4-Flash`，实际请求名是 `deepseek-ai/DeepSeek-V4-Flash`
- 大小写差异（DeepSeek vs deepseek）
- 多了 / 少了路径前缀

去 §7.1 第 5 步检查。

### Q2：用户说"我被限流了"

排查：

1. 查 audit_logs：`sqlite3 ...db "SELECT * FROM audit_logs WHERE event_type='quota_exceeded' AND user_id='<uuid>';"`
2. 查 Redis：`redis-cli GET quota:<user_id>:<today>` 看当日 token 数
3. 看是否真的超 `.env` 的 `QUOTA_DAILY_TOKENS_PER_USER`
4. 临时解封：`redis-cli DEL quota:<user_id>:<today>`
5. 长期方案：调高阈值（不要长期调高，应该看是不是有滥用）

### Q3：eval 跑分卡在"Loading dataset..."

可能原因：

- LangSmith Cloud 慢或中国大陆访问受限 → 切 VPN
- Dataset id 错误 → 去 LangSmith Web 查 dataset URL 中的 id
- `LANGSMITH_API_KEY` 过期 / 权限不足 → 重新生成

### Q4：审计日志查到一条疑似攻击 trace，怎么处理？

1. 立刻把命中关键词加到 `blacklist.yaml`
2. 重启 Agent
3. 在 `audit_logs` 表中查同一 `user_id` 的所有命中记录，判断是恶意用户还是误用
4. 若多次恶意，**人工**通过后端管理页面禁用该账号（v1 不自动封号）
5. 留 issue 在项目中跟踪长期方案

### Q5：新开 Cursor 窗口，输入"做 monitor"，Cursor 没自动加载监控规则

排查：

1. 检查 `.cursor/rules/05-monitoring-context.mdc` 是否存在（路径正确）
2. 检查 `.cursorrules` 末尾是否有"监控体系开发约定"小节
3. 在 Cursor 中 `Cmd+Shift+P` → "Cursor: Rebuild Index" 重建索引
4. 在对话框里手动 @ 一次 `docs/monitor/REQUIREMENTS.md`，下次它就有记忆了

### Q6：Phase 7-4 后的某天，guardrails 误杀了正常用户

1. 取出 trace_id，去 audit_logs 查 payload 看命中了什么关键词
2. 在 `blacklist.yaml` / `sensitive.yaml` 把该关键词改成更精确的正则（如把整词 `delete` 改为 `\bdelete\s+from\s+users\b`）
3. 重启 Agent
4. 在 PROGRESS.md "已知问题"区记录这次误杀，便于 v2 优化

### Q7：能不能给监控体系加邮件 / 飞书告警？

**v1 不做**（参见 `REQUIREMENTS.md` §8 决策 #3 与 §8.1）。

v2 视情况补，建议接 webhook + 阈值规则（如"prompt_injection 当小时 > 10 次就推飞书机器人"）。

### Q8：成本卡片显示某用户当日烧了 50000 token 但配额是 200000，看起来不像异常

正常。**配额是上限**不是预期值。50000 大约对应 30~50 轮密集对话或 1~2 轮长文档 RAG。

只要不超 200000 就 OK；如果发现某用户**频繁接近上限**（如连续 3 天 >180000），人工调研是不是有滥用。

### Q9：LangSmith 配额耗尽（免费版每月 5k traces）

短期：

1. 在 `.env` 设 `LANGCHAIN_TRACING_V2=false` 关闭上报
2. 重启 Agent

长期：升级 LangSmith 套餐，或自托管 Langfuse（参考 `2.TECH_SELECTION.md` §10.1 迁移工作量评估）。

### Q10：我能在生产环境跑这套监控吗？

**v1 设计目标是 demo / 开发期**。生产用前必须补：

- 多租户隔离（`REQUIREMENTS.md` §8 决策 #11 明确 v1 不做）
- 告警通道（§8 决策 #3）
- LangSmith Cloud 的数据合规检查（中国大陆出境）
- `INTERNAL_API_KEY` 改强随机 + 上 KMS
- `audit_logs` 表分库 / 归档策略

---

## 9. 变更记录

| 版本 | 日期 | 变更 |
|---|---|---|
| v1 | 2026-05-13 | 首版。覆盖日常巡检 / 看板 / Bad case / Eval / Guardrails / 成本 6 大场景 + 10 个 FAQ。 |
