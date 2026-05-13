# Phase 7-2 / Step 1：LangSmith Models 单价配置（4 条记录，仅 Web 操作）

## 上下文

Phase 7-2 第一步。**不写一行代码**，全部在 LangSmith Web 端完成。目标是让 LangSmith Trace 详情页的 `Cost` 列、Dashboard 的 `Daily Cost` 卡片自动算出货币金额。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §8 决策 #7（LangSmith Models 单价 + 手工填）
- `@docs/monitor/1.PRD.md` §5.3.1（LangSmith Models 单价 4 条记录验收清单）
- `@docs/monitor/USER_GUIDE.md` §6（SiliconFlow 价格快照参考）
- `@.env`（确认当前模型名）

前置条件：

- Phase 7-1 完成（LangSmith 上能看到 trace）
- 拥有 LangSmith Workspace 的 `Admin` 或 `Member` 权限

## 任务

### 任务 0：核对最新模型名

打开 `@.env`，记录三个变量的当前值：

```dotenv
OPENAI_MODEL_NAME=deepseek-ai/DeepSeek-V4-Flash          # 主 LLM
OPENAI_LLM_AS_JUDGE=Pro/moonshotai/Kimi-K2.6             # eval 评估器
OPENAI_EMBEDDING_MODEL=BAAI/bge-large-zh-v1.5            # 向量
```

> Reranker 模型名为 `BAAI/bge-reranker-v2-m3`（一般 hardcode 在 `packages/agent/src/rag/` 里）。
>
> ⚠️ **如果 `.env` 中模型名与上面不一致，以 `.env` 为准**，并在本 step 完成时把任务 1 表格中模型名同步更新。

### 任务 1：查询 SiliconFlow 当前价格

打开 https://siliconflow.cn/zh-cn/pricing ，记录以下 4 个模型的「输入价 / 输出价」（单位：¥/百万 tokens）。

LangSmith 单价输入是 **每 1 token 的 USD 金额**，需要：

```
LangSmith 单价 (USD/token) = SiliconFlow 价 (¥/M tokens) ÷ 1_000_000 ÷ 7.2 (汇率)
```

> 汇率参考 ¥→USD 取 7.2，**填入时四舍五入到小数后 10 位**（LangSmith 输入框最长 12 位有效数字）。

填表（示例数字仅为格式参考，**实际数字现场查**）：

| # | 模型名（LangSmith Model Name 字段必须严格一致）| 输入价（¥/M tokens）| 输出价（¥/M tokens）| Prompt USD/token | Completion USD/token |
|---|---|---|---|---|---|
| 1 | `deepseek-ai/DeepSeek-V4-Flash` | 现场查 | 现场查 | ÷1e6÷7.2 | ÷1e6÷7.2 |
| 2 | `Pro/moonshotai/Kimi-K2.6` | 现场查 | 现场查 | ÷1e6÷7.2 | ÷1e6÷7.2 |
| 3 | `BAAI/bge-large-zh-v1.5` | 现场查（embedding 只有输入价）| — | ÷1e6÷7.2 | 0 |
| 4 | `BAAI/bge-reranker-v2-m3` | 现场查（rerank 只有输入价）| — | ÷1e6÷7.2 | 0 |

**示例换算**：

若 `DeepSeek-V4-Flash` 价格为 ¥0.45 / ¥0.90（输入/输出）每百万 tokens，则：

```
Prompt cost     = 0.45 / 1_000_000 / 7.2 = 0.0000000625  (USD/token)
Completion cost = 0.90 / 1_000_000 / 7.2 = 0.0000001250  (USD/token)
```

### 任务 2：在 LangSmith Web 端新增 4 条 Models 记录

#### 2.1 进入 Models 页面

1. 打开 https://smith.langchain.com
2. 顶部右上角 → 你的 workspace 名 → 点击进入 **Settings**
3. 左侧导航：**Models**（如果找不到，路径是 `Settings → Workspace → Models`，UI 可能随版本调整）

#### 2.2 逐条 New Model

对任务 1 表格中每一行，点击右上角 `+ New Model` → 填写：

| LangSmith 字段 | 填写规则 |
|---|---|
| Model Name (Match Pattern) | **严格** 等于 `.env` 中的 `OPENAI_MODEL_NAME`（含 `/`、大小写）。例如 `deepseek-ai/DeepSeek-V4-Flash` |
| Provider | 选 `openai`（因 SiliconFlow 走 OpenAI-compatible 接口；LangSmith 把它识别为 openai-family）|
| Match Pattern Type | `Exact Match`（不要用正则）|
| Prompt Cost (USD/token) | 任务 1 表格 D 列数字 |
| Completion Cost (USD/token) | 任务 1 表格 E 列数字 |
| Notes | 写入：`SiliconFlow 报价 X.XX/Y.YY 元/M tokens，¥→USD=7.2，<今天日期>` |

点击 `Save`。重复 4 次。

#### 2.3 验证记录已生效

切回 Project 视图，点开一条 **Phase 7-1 完成后** 产生的 trace（含 LLM 调用的）。右侧或顶部应能看到：

```
Tokens: <prompt> / <completion> / <total>
Cost: $0.000XXX
```

`Cost` 字段**应当显示美元金额**（之前是 `--` 或空）。

> 如果旧 trace 仍显示 `--`，**重新发送一条对话**触发新 trace 即可。LangSmith 在 trace 落地时按当时单价快照计算，**不会回填**历史 trace。

### 任务 3：把单价快照沉淀到 USER_GUIDE.md

修改 `@docs/monitor/USER_GUIDE.md` §6 "SiliconFlow 价格快照"段。把原占位符替换为本次实际查到的数字，格式：

```markdown
### SiliconFlow 价格快照（YYYY-MM-DD 查询）

| 模型 | 输入（¥/M tokens）| 输出（¥/M tokens）| LangSmith Prompt (USD/token) | LangSmith Completion (USD/token) |
|---|---|---|---|---|
| `deepseek-ai/DeepSeek-V4-Flash` | <实际> | <实际> | <实际> | <实际> |
| `Pro/moonshotai/Kimi-K2.6` | <实际> | <实际> | <实际> | <实际> |
| `BAAI/bge-large-zh-v1.5` | <实际> | — | <实际> | 0 |
| `BAAI/bge-reranker-v2-m3` | <实际> | — | <实际> | 0 |

> 汇率：¥→USD = 7.2（查询日参考值）
> 复核周期：建议每月初对账一次
```

## 验证

| 断言 | 描述 | 状态 |
|---|---|---|
| 1 | LangSmith Settings → Models 列表能看到 4 条记录 | ⬜ |
| 2 | 模型名严格匹配 `.env` 中的字符串（含 `/`）| ⬜ |
| 3 | 新建一条对话后，trace 详情页 `Cost` 字段显示美元金额（非 `--`）| ⬜ |
| 4 | `USER_GUIDE.md` 已沉淀本次价格快照 | ⬜ |

## 完成后

### 更新 PROGRESS.md

```
| 7-2-1 | LangSmith Models 单价配置（4 条记录） | ✅ | <今天日期> | 4 条 Models 已配；trace 详情页 Cost 字段显示美元；USER_GUIDE 价格快照已沉淀 |
```

### git commit

```bash
git add docs/monitor/USER_GUIDE.md docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
docs(monitor): phase-7-2 step-1 LangSmith Models 单价配置完成

- LangSmith Settings → Models 新增 4 条记录:
  * deepseek-ai/DeepSeek-V4-Flash
  * Pro/moonshotai/Kimi-K2.6
  * BAAI/bge-large-zh-v1.5
  * BAAI/bge-reranker-v2-m3
- USER_GUIDE.md §6 价格快照已用 <日期> 实际数字回填
- DoD: trace 详情页 Cost 字段不再是 --

ref: docs/monitor/PROGRESS.md 7-2-1
EOF
)"
```

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| Models 页面看不到 `+ New Model` 按钮 | 权限是 `Viewer` | 让 workspace 管理员把你升级到 `Member`+ |
| 新建 trace 仍显示 `Cost: --` | Model Name 不匹配（差一个 `/` 或大小写）| 回到 Settings → Models → Edit → Model Name 改为与 `.env` 完全一致 |
| LangSmith 报 "Invalid cost format" | 数字用了科学计数法 (`6.25e-8`) | 改为普通小数 `0.0000000625` |
| Cost 显示 $0.00（应为非零） | 单价太小被截断显示 | 把鼠标 hover 到 `Cost` 字段看完整数字；或单笔聊一段长文本验证 |
