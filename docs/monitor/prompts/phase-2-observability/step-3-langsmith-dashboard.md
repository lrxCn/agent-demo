# Phase 7-2 / Step 3：LangSmith Dashboard 配置（6 卡片，仅 Web 操作）

## 上下文

Phase 7-2 收尾步骤。**不写代码**，全部在 LangSmith Web 端配置一个名为 `plan2code-cost-overview` 的 Dashboard，包含 6 个卡片，作为日常巡检的统一入口。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §2 目标 1（看板形态：只用 LangSmith 网页）
- `@docs/monitor/1.PRD.md` §5.3.3（6 卡片定义 + 验收清单）
- `@docs/monitor/USER_GUIDE.md` §1（看板每日 5 分钟巡检流程）
- `@docs/monitor/PROGRESS.md`

前置条件：

- 7-2-1 完成（Models 单价已配，trace cost 字段非空）
- 7-2-2 完成（已积累至少 10 条带 `rag:*` tag 的 trace）
- 建议先在前端跑十几条 mix 对话（含 hit / miss / 错误路径），让看板有数据

## 任务

### 任务 1：创建 Dashboard

1. 打开 https://smith.langchain.com
2. 左侧导航 → **Dashboards** → 右上角 `+ New Dashboard`
3. 填写：
   - Name: `plan2code-cost-overview`
   - Description: `plan2code Phase 7 监控总览看板：trace 数 / 成本 / 错误率 / RAG 命中率 / latency P95 / token 用量`
   - Workspace 默认即可
4. 创建后进入空白看板，进入"编辑模式"。

### 任务 2：添加 6 个卡片

每个卡片的操作流程一致：

1. 右上角 `+ Add Chart`
2. 选 Chart Type
3. 在 Data Source 选 `Traces`
4. 设置 Project Filter = 你的 project（如 `plan2code-agent`）
5. 设置 Time Range = 默认 `Last 24 hours`（看板顶部可全局切换）
6. 配置 Metric / GroupBy / Filter
7. 命名 Card 并保存

#### 卡片 1：Total Traces（24h）

| 字段 | 值 |
|---|---|
| Chart Type | **Single Stat (Number)** |
| Metric | `count(traces)` |
| Filter | （无）|
| Title | `Total Traces (24h)` |
| 期望 | 一个大数字，如 `47` |

**目的**：一眼看出最近 24h 有没有正常使用量；归零说明集成断了。

#### 卡片 2：Error Rate（24h）

| 字段 | 值 |
|---|---|
| Chart Type | **Single Stat** |
| Metric | `error_rate` 或 `% traces where error = true` |
| Title | `Error Rate (24h)` |
| 期望 | 一个百分比，如 `2.1%` |

**目的**：错误率 > 5% 时需要人工排查。

> 若 LangSmith UI 没有直接的 `error_rate` 度量，用 `count(traces where error = true) / count(traces)` 自行表达；或建两个 Single Stat 卡片对比观察。

#### 卡片 3：Daily Cost（24h，USD）

| 字段 | 值 |
|---|---|
| Chart Type | **Single Stat** |
| Metric | `sum(total_cost)`（依赖任务 7-2-1 已配 Models 单价）|
| Title | `Daily Cost (24h, USD)` |
| 期望 | 美元金额，如 `$0.42` |

**目的**：日成本上限的红线监控（建议人工心里设 $5/day 内）。

#### 卡片 4：RAG Hit Rate（24h）

| 字段 | 值 |
|---|---|
| Chart Type | **Single Stat** 或 **Donut Chart** |
| Metric | `count(traces where tags has "rag:hit") / (count(rag:hit) + count(rag:miss))` |
| Title | `RAG Hit Rate (24h)` |
| 期望 | 百分比，如 `68%` |

**目的**：RAG 命中率 < 60% 说明知识库需要补内容 / Embedding 模型需要调优。

> 实现技巧：建两个 Bar Chart，X 轴 = tag 值（hit/miss），Y 轴 = trace 数，并排显示；或用 LangSmith 的 `Group By tags`。

#### 卡片 5：Latency P95（24h，秒）

| 字段 | 值 |
|---|---|
| Chart Type | **Line Chart** |
| Metric | `p95(latency_seconds)` |
| X 轴 | `time bucket = 1 hour` |
| Y 轴 | seconds |
| Title | `Latency P95 (24h)` |
| 期望 | 折线图，24 个点，整体在 5~15s 之间 |

**目的**：P95 突变 = 模型 / 网络 / 工具退化预警。

#### 卡片 6：Token Usage by Model（24h）

| 字段 | 值 |
|---|---|
| Chart Type | **Stacked Bar Chart** |
| Metric | `sum(prompt_tokens + completion_tokens)` |
| Group By | `model_name`（即 LangSmith 的 model.match_pattern）|
| Title | `Token Usage by Model (24h)` |
| 期望 | 一根或多根堆叠柱状（按模型分色），柱状中可看 `deepseek-ai/DeepSeek-V4-Flash` 占大头 |

**目的**：识别哪个模型在烧 token，是否能用更便宜模型替换。

### 任务 3：调整布局 + 保存

1. 拖拽 6 个卡片到合适网格（推荐 3 列 × 2 行）。
2. 顶部 Time Range 切到 `Last 24 hours`，确认每个卡片都有数据。
3. 点击右上角 `Save Dashboard`。
4. 复制当前 URL（形如 `https://smith.langchain.com/o/<orgId>/dashboards/<dashboardId>`），**待会要写入 `USER_GUIDE.md`**。

### 任务 4：把看板 URL 沉淀到 `USER_GUIDE.md`

修改 `@docs/monitor/USER_GUIDE.md` §1 "每日 5 分钟巡检"段。把开头那行 `打开 LangSmith Dashboard ...` 改为：

```markdown
**每日入口**：[`plan2code-cost-overview`](https://smith.langchain.com/o/<orgId>/dashboards/<dashboardId>)
```

（把 `<orgId>` / `<dashboardId>` 换成实际值）

并在同段下方追加：

```markdown
### 红线值（人工心里阈值，超线立即排查）

| 卡片 | 红线 | 触发动作 |
|---|---|---|
| Total Traces (24h) | 0 | 集成断了，检查 Agent / Backend 是否运行 |
| Error Rate (24h) | > 5% | 按 `rg "trace_id=<X>"` 反查最近错误 trace |
| Daily Cost (24h) | > $5 | 查 Token Usage by Model 卡片，定位"烧钱"模型 |
| RAG Hit Rate (24h) | < 60% | 补充知识库内容 / 调 Embedding 阈值 |
| Latency P95 (24h) | > 15s | 在 LangSmith Filter trace 按 latency 排序，看最慢的 span |
| Token Usage by Model | 异常飙升 | 同 Daily Cost 排查 |
```

## 验证

| 断言 | 描述 | 状态 |
|---|---|---|
| 1 | Dashboard `plan2code-cost-overview` 已创建并可访问 | ⬜ |
| 2 | 6 个卡片均有数据（不是 `--` 或空）| ⬜ |
| 3 | RAG Hit Rate 数字与 `tags has "rag:hit"` Filter 结果一致 | ⬜ |
| 4 | Daily Cost 显示非零美元值 | ⬜ |
| 5 | USER_GUIDE.md §1 已写入实际 Dashboard URL | ⬜ |
| 6 | USER_GUIDE.md 已列 6 条红线 | ⬜ |

## 完成后

### 更新 PROGRESS.md

#### 7-2-3 标 ✅

```
| 7-2-3 | LangSmith Dashboard 配置（6 个卡片） | ✅ | <今天日期> | plan2code-cost-overview 已上线；URL 已沉淀到 USER_GUIDE.md §1 |
```

#### Phase 7-2 整体标 ✅

找到：

```
## Phase 7-2：可观测性看板（目标 1，P0）

**整体：⬜ 未开始**（预估 0.5 天）
```

改为：

```
## Phase 7-2：可观测性看板（目标 1，P0）

**整体：✅ 已完成（<今天日期>）**（实际工期 X 天）
```

#### DoD-2 标 ✅

```
| DoD-2 | 看板可用 | ✅ | LangSmith Dashboard 6 卡片均有数据；URL 沉淀 |
```

### git commit

```bash
git add docs/monitor/USER_GUIDE.md docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
docs(monitor): phase-7-2 step-3 LangSmith Dashboard 6 卡片上线

LangSmith Dashboard `plan2code-cost-overview` 配置完成：
1. Total Traces (24h)
2. Error Rate (24h)
3. Daily Cost (24h, USD)
4. RAG Hit Rate (24h)
5. Latency P95 (24h)
6. Token Usage by Model (24h)

- USER_GUIDE.md §1 写入 Dashboard URL + 6 条红线
- Phase 7-2 整体完成
- DoD-2 看板可用 ✅

ref: docs/monitor/PROGRESS.md Phase 7-2
EOF
)"
```

### 下一步

Phase 7-2 完成后，按依赖图可并行启动 Phase 7-3（Eval）。同时建议**每天花 5 分钟看看板**，让数据真的进入工作习惯——这是 monitoring 体系存活的关键。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| 卡片 `Daily Cost` 仍是 `$0.00` | 7-2-1 Models 单价没配 / Model Name 不匹配 | 回 Step 1，确认 LangSmith Settings → Models 4 条记录 |
| 卡片 `RAG Hit Rate` 为空 | 24h 内还没产生带 `rag:*` tag 的 trace | 在前端发几条对话触发 KB 工具调用，等 1~2 分钟看板自动刷新 |
| Latency P95 卡片报 "Insufficient Data" | trace 总数 < 20 | 多触发几次对话；或把 Time Range 切到 7 days |
| `Group By model_name` 选项找不到 | LangSmith UI 字段名是 `metadata.ls_model_name` 或 `model.match_pattern` | 改用 "Custom GroupBy" 输入 `metadata.ls_model_name` |
| Dashboard 创建后他人打不开 | Workspace 内权限 / Org 权限设置 | LangSmith → Settings → Workspace → Members 邀请同事 |
