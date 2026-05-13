# Phase 7-5 / Step 1：产出《成本 & 性能优化 Playbook》（纯文档）

## 上下文

Phase 7-5 唯一一步。**全部纯文档产出**，无代码改动。目标是把 LangSmith Dashboard 看到的数据转化为**候选优化清单**，每项含"现状成本 / 改进方案 / 预期降本 / 实施工作量 / 风险"。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §2 目标 5（看-改-再看反馈环）+ §8 决策 #7（不自研成本计算）
- `@docs/monitor/1.PRD.md` §5.5（目标 5 验收清单）
- `@docs/monitor/USER_GUIDE.md` §1（看板红线）+ §6（SiliconFlow 价格快照）
- `@docs/monitor/PROGRESS.md`

前置条件：

- Phase 7-1 ~ 7-4 全部完成
- 监控体系已**稳定运行至少 7 天**，看板有真实数据（如果不到 7 天，可先用 24h 数据写 v0.1，作为"上线即版本"占位）

## 任务

### 任务 1：采集 LangSmith 看板数据（手动）

打开 `plan2code-cost-overview` Dashboard，切到 **Last 7 days** 时间窗口。记录以下 6 个数字：

| 指标 | 取数方式 | 记录值 |
|---|---|---|
| 总 trace 数 | 卡片 1 | _____ |
| 错误率 | 卡片 2 | _____% |
| 总成本（USD） | 卡片 3 | $_____ |
| RAG 命中率 | 卡片 4 | _____% |
| Latency P95 | 卡片 5 | _____ s |
| Top-1 模型 token 占比 | 卡片 6（看堆叠柱状最大段） | _____% by `<模型名>` |

### 任务 2：找出 Top-10 最贵 trace

LangSmith → Projects → 你的 project → 顶部 **Sort by → Cost (desc)** → 切换时间窗口 Last 7 days → 记录前 10 条 trace 的：

| # | trace_id (前 8 位) | cost (USD) | latency (s) | 简要场景 |
|---|---|---|---|---|
| 1 | _____ | $_____ | _____ | _____ |
| 2 | _____ | $_____ | _____ | _____ |
| 3 | _____ | $_____ | _____ | _____ |
| 4 | _____ | $_____ | _____ | _____ |
| 5 | _____ | $_____ | _____ | _____ |
| 6 | _____ | $_____ | _____ | _____ |
| 7 | _____ | $_____ | _____ | _____ |
| 8 | _____ | $_____ | _____ | _____ |
| 9 | _____ | $_____ | _____ | _____ |
| 10 | _____ | $_____ | _____ | _____ |

观察规律：

- 同一种场景是否反复占据 Top？（=> 该场景是"主战场"）
- 单次 trace cost 异常的（>> 平均）？（=> 异常路径，可能 prompt 过长 / 工具循环）
- 总成本贡献最大的模型是哪一个？

### 任务 3：产出 `docs/monitor/COST_OPTIMIZATION_PLAYBOOK.md`

新建文件 `docs/monitor/COST_OPTIMIZATION_PLAYBOOK.md`，**全文按下面模板**（占位符 `<...>` 用任务 1 / 任务 2 的实际数字替换）：

```markdown
# plan2code 成本 & 性能优化 Playbook（v<x.y>）

> **本文档是"反馈环的右半边"**：左边是看板（看），右边是 Playbook（改）。
>
> 数据快照：<YYYY-MM-DD> 拉取 LangSmith Dashboard `plan2code-cost-overview` Last 7 days。

## 1. 现状基线（7 天）

| 指标 | 实际值 | 红线 | 健康度 |
|---|---|---|---|
| Total Traces | <数字> | n/a | n/a |
| Error Rate | <%> | < 5% | <✅/⚠️/❌> |
| Total Cost | <$> | < $35/周 | <✅/⚠️/❌> |
| RAG Hit Rate | <%> | > 60% | <✅/⚠️/❌> |
| Latency P95 | <s> | < 15s | <✅/⚠️/❌> |
| 主导模型 | `<model>` | n/a | <%> 总 token |

### 1.1 Top-10 最贵 trace 模式归纳

<把任务 2 表格贴这里，并在末尾用一段话归纳：例如 "Top 10 中有 7 条都是 RAG 查询，
平均 cost $0.04，远高于普通对话 $0.003"。>

## 2. 候选优化项

每一项的格式：

> **候选项 N — <名称>**
> - **现状成本**：<占总成本的 ~% / 平均单次 $X>
> - **改进方案**：<一句话 + 涉及的代码位置（文件路径）>
> - **预期降本**：<-X% 或 -$Y/月>
> - **实施工作量**：<S/M/L>（S=半天内，M=2~3 天，L=>1 周）
> - **风险**：<可能的回归 / 副作用>
> - **回滚策略**：<如何快速关掉>

---

### 候选 1 — RAG 检索结果数量调优

- **现状成本**：RAG miss 占 _____%（卡片 4），命中时 contexts 数=5（默认），平均 prompt tokens _____。
- **改进方案**：在 `packages/agent/src/rag/retriever.py` 把 `top_k=5` 改为 `top_k=3`；在 `chat_node` 注入 contexts 时按相似度阈值再过滤一遍 < 0.5 的丢弃。
- **预期降本**：prompt tokens -30%~40%，按主模型单价折算约 $_____/月。
- **实施工作量**：S（半天内）
- **风险**：top_k 减小可能让 hit rate 下降 5%；需在 Phase 7-3 跑一次 eval 对比 `ragas_context_precision`。
- **回滚策略**：把 `top_k` 改回 5；用 Phase 7-3 `pnpm eval:run --baseline <改之前实验名>` 拉数验证。

### 候选 2 — 短消息走更便宜的模型

- **现状成本**：当前主模型 `<deepseek-ai/DeepSeek-V4-Flash>` 占 _____%。但 Top-10 中有 _____ 条是"你好/几点了"等极短对话。
- **改进方案**：在 `packages/agent/src/graph/nodes.py` `chat_node` 增加路由判断：若 `state.messages` 最近一条 HumanMessage 长度 < 20 字符且未触发任何工具调用 → 临时切到更便宜的备选模型（如 `Qwen3-Lite-Free` 之类）。需在 `.env` 加 `OPENAI_MODEL_SHORT`。
- **预期降本**：短对话占 ~__%，按 ratio × 单价差折算约 $_____/月。
- **实施工作量**：M（含 eval 校验）
- **风险**：模型切换可能让短对话回答风格不一致；需做 eval baseline。
- **回滚策略**：把 `chat_node` 路由分支删除，或把 `OPENAI_MODEL_SHORT` 改回主模型名。

### 候选 3 — 系统提示词瘦身

- **现状成本**：检查 LangSmith trace 上 chat_node 的 invocation_params.messages，系统提示长度 = _____ tokens。
- **改进方案**：在 `packages/agent/src/graph/nodes.py` 抽取系统提示到 `src/prompts/system.md`，压缩重复指令；记忆注入部分仅在 retrieved_memories 非空时拼接。
- **预期降本**：系统提示 -X%，按"每次对话都消耗"折算月降本 $_____/月。
- **实施工作量**：S
- **风险**：删指令可能让 LLM 行为变差；用 eval 验证 `llm_judge_score`。
- **回滚策略**：恢复原 prompt 文本。

### 候选 4 — Embedding 调用合并

- **现状成本**：每次 `search_knowledge_base` 调用一次 embedding；高峰每分钟 _____ 次。
- **改进方案**：`packages/agent/src/rag/indexer.py` 在批量场景下用 batch API（一次 16 个 query），单价不变但 RTT 减少。
- **预期降本**：成本不变；P95 latency -X%。
- **实施工作量**：M
- **风险**：实时检索不能 batch；只对批量任务有效。
- **回滚策略**：恢复单 query 调用。

### 候选 5 — Mem0 检索缓存

- **现状成本**：每轮对话都打 Mem0 检索（_____% 调用 thread 复用率）。
- **改进方案**：在 `packages/agent/src/memory/long_term.py` 增加 thread 级缓存（短 TTL 30s），同 thread 内连续多轮共享 memory 结果。
- **预期降本**：embedding 调用次数 -%。
- **实施工作量**：S
- **风险**：thread 内最新写入的 memory 30s 内不可见；可接受。
- **回滚策略**：注释掉缓存层。

### 候选 N — <根据你看到的真实数据，自由追加 1-2 条>

---

## 3. 优先级决策矩阵

| 候选 | 降本 | 工作量 | ROI = 降本/工作量 | 建议次序 |
|---|---|---|---|---|
| 1 | <-$/月> | S | 高 | **本周** |
| 2 | <-$/月> | M | 中 | 下周 |
| 3 | <-$/月> | S | 高 | **本周** |
| 4 | <-$/月> | M | 低 | 暂缓 |
| 5 | <-$/月> | S | 中 | 下周 |

> 优先做 ROI 高 + 风险低 + 有 eval 兜底的项。

## 4. 实施清单（next 2 周）

- [ ] **W1**：实施候选 X、Y（ROI 最高的两个）
- [ ] **W1**：每个候选实施后跑 `pnpm eval:run -- --dataset bad --baseline <实施前实验名>`
- [ ] **W2**：对比 LangSmith Dashboard 7 天均值，验证降本是否达预期
- [ ] **W2**：未达预期的候选 → 回滚，加入"经验池"
- [ ] **W2**：再产出 Playbook v<x.y+1>，循环

## 5. 已采纳的优化项历史

| 候选项 | 实施日期 | 实施前成本 | 实施后成本 | 实际降本 | 备注 |
|---|---|---|---|---|---|
| _首次产出，本表暂空_ | | | | | |

## 6. 不做清单（v1 暂不考虑）

明确**不做**的优化项，避免下次又被讨论：

| 不做的事 | 原因 |
|---|---|
| 自研 LLM router | 工程量 L 且 LangChain `RunnableBranch` 够用 |
| Prompt Cache（OpenAI 类） | SiliconFlow 当前不支持 prompt caching |
| 量化模型本地部署 | 与目标 5 的"成本优化反馈环"无关；运维成本另算 |
| 多模型并发 ensemble | 工作量 L 且降本不显著（成本 ×2） |

## 7. 变更记录

| 日期 | 版本 | 主要变化 |
|---|---|---|
| <YYYY-MM-DD> | v<x.y> | 首次产出（7 天数据快照） |
```

### 任务 4：把 Top-3 优化项沉淀到 `PROGRESS.md` 后续动作

修改 `@docs/monitor/PROGRESS.md`，在文件末尾"已知问题"段之后**追加**：

```markdown
## Phase 7 后续动作（来自 COST_OPTIMIZATION_PLAYBOOK v<x.y>）

| 优先级 | 优化项 | 预估降本 | 负责人 | 计划完成 |
|---|---|---|---|---|
| P0 | 候选 <X>（名字）| <$> | _____ | <日期> |
| P0 | 候选 <Y>（名字）| <$> | _____ | <日期> |
| P1 | 候选 <Z>（名字）| <$> | _____ | <日期> |

> 完成后在本表标 ✅，并在 `COST_OPTIMIZATION_PLAYBOOK.md` §5 添加历史记录。
```

### 任务 5：在 `USER_GUIDE.md` 加 Playbook 入口

修改 `@docs/monitor/USER_GUIDE.md`，在 §1（每日 5 分钟巡检）末尾**追加**：

```markdown
### 每月一次 — 成本反馈环

第 1 周完成后开始：

1. 重跑本文 §1 的 7 天看板巡检，记录数字
2. 找出 Top-10 最贵 trace，归纳模式
3. 用 `@docs/monitor/COST_OPTIMIZATION_PLAYBOOK.md` 模板**追加一个新版本**（v<x.y+1>）
4. 选 ROI 最高的 1~2 项实施，**每次实施配合 `pnpm eval:run --baseline`** 验证未引入回归
5. 在 Playbook §5 "已采纳的优化项历史"添加一行
```

## 验证

| 断言 | 描述 | 状态 |
|---|---|---|
| 1 | `COST_OPTIMIZATION_PLAYBOOK.md` 已创建 | ⬜ |
| 2 | §1 基线数字全部填了真实值（无占位符） | ⬜ |
| 3 | §2 至少含 3 个候选项（不必照搬模板 5 个） | ⬜ |
| 4 | §3 决策矩阵 ROI 列已填 | ⬜ |
| 5 | `PROGRESS.md` 已追加"后续动作"区，含 Top-3 优先级 | ⬜ |
| 6 | `USER_GUIDE.md` §1 已追加"每月一次"段 | ⬜ |

## 完成后

### 更新 PROGRESS.md

#### 7-5-1 标 ✅

```
| 7-5-1 | 《成本优化 Playbook》产出 | ✅ | <今天日期> | docs/monitor/COST_OPTIMIZATION_PLAYBOOK.md v<x.y>；候选项 N 个；Top-3 已沉淀到 PROGRESS 后续动作；USER_GUIDE 加月度 SOP |
```

#### Phase 7-5 整体标 ✅

```
## Phase 7-5：成本优化反馈环（目标 5，P2）

**整体：✅ 已完成（<今天日期>）**
```

#### DoD-5 标 ✅

```
| DoD-5 | 成本优化反馈环 | ✅ | Playbook v1 已上线；月度 SOP 已写入 USER_GUIDE |
```

#### Phase 7 整体收尾

在 PROGRESS.md 顶部添加（如尚未有）：

```
**Phase 7 全部完成：<今天日期>**

5 个 DoD 全部通过：
- DoD-1 trace 闭环 ✅
- DoD-2 看板可用 ✅
- DoD-3 eval 跑分 ✅
- DoD-4 安全边界 ✅
- DoD-5 成本优化反馈环 ✅
```

### git commit

```bash
git add docs/monitor/COST_OPTIMIZATION_PLAYBOOK.md \
        docs/monitor/PROGRESS.md \
        docs/monitor/USER_GUIDE.md

git commit -m "$(cat <<'EOF'
docs(monitor): phase-7-5 step-1 产出《成本 & 性能优化 Playbook v1》

- 新增 docs/monitor/COST_OPTIMIZATION_PLAYBOOK.md
  * §1 7 天基线（6 个看板指标 + Top-10 trace 归纳）
  * §2 候选优化项（5 个起，含工作量 / 风险 / 回滚）
  * §3 ROI 决策矩阵
  * §4 next 2 周实施清单
  * §5 已采纳历史（持续累积）
  * §6 不做清单（4 项已显式拒绝）
- PROGRESS.md 追加"Phase 7 后续动作" Top-3 区
- USER_GUIDE.md §1 加"每月一次"月度反馈环 SOP
- Phase 7-5 完成；DoD-5 ✅
- Phase 7 整体完成；5 个 DoD 全通过

ref: docs/monitor/PROGRESS.md Phase 7
EOF
)"
```

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| LangSmith 没有 7 天数据 | 监控运行不到 1 周 | 先用 24h 数据写 v0.1，1 周后再升 v1 |
| 看板某些卡片仍空 | 触发场景不够 | 在前端跑 10~20 次 mix 对话凑数据 |
| Top-10 trace 都长得一样 | 测试用户行为单一 | 多角色 / 多场景跑一周再回来 |
| 候选项找不到 | 现状已经很好（cost 低于红线）| 把 §2 空着，§6 不做清单写明"现阶段健康"即可；这也是有效产出 |

### 下一步

Phase 7-5 完成后：

- 所有 9 份核心文档 + 19 个 step prompt 已就绪
- 进入"日常运行 + 月度迭代"阶段，按 `USER_GUIDE.md` §1 每日 5 分钟 + 每月 1 次成本反馈环
- 监控体系工作流闭环：**看板（看）→ Playbook（改）→ Eval（验证）→ 看板（再看）**
