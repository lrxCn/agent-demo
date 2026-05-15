---
name: langsmith-cost-review
description: 拉取 LangSmith 项目最近 N 天的成本与性能数据，输出完整分析报告（基线指标、Top-N 高成本 trace、模式归纳、优化建议与实施优先级）。当用户明确要求“拉 LangSmith 数据”“做成本分析”“给降本建议/总结”时使用。
disable-model-invocation: true
---

# LangSmith 成本分析 Skill

## 使用场景

- 用户明确要求从 LangSmith 拉取真实数据。
- 用户要求输出成本/性能分析总结，含可执行优化建议。
- 用户要更新 `docs/monitor/COST_OPTIMIZATION_PLAYBOOK.md` 一类文档。

## 默认参数

- `project`: `plan2code-agent`
- `days`: `7`
- `top`: `10`

## 执行步骤

1. 运行拉数脚本（在仓库根目录）：

```bash
uv run --project packages/agent python .cursor/skills/langsmith-cost-review/scripts/pull_langsmith_metrics.py --project plan2code-agent --days 7 --top 10
```

2. 若用户指定了窗口或项目名，替换参数后重跑。
3. 读取 JSON 输出并检查：
   - `summary`
   - `top_traces`
   - `scenario_distribution`
4. 产出完整报告（见下方模板）。

## 一键落文档模式

当用户要求“直接写文档”时，执行：

```bash
uv run --project packages/agent python .cursor/skills/langsmith-cost-review/scripts/pull_langsmith_metrics.py --project plan2code-agent --days 7 --top 10 --write-docs --version v1.1
```

先预览不落盘：

```bash
uv run --project packages/agent python .cursor/skills/langsmith-cost-review/scripts/pull_langsmith_metrics.py --project plan2code-agent --days 7 --top 10 --write-docs --dry-run --version v1.1
```

`--write-docs` 会更新 3 个文件：

- `docs/monitor/COST_OPTIMIZATION_PLAYBOOK.md`（整文件覆盖为最新版本）
- `docs/monitor/PROGRESS.md`（写入/刷新“后续动作”标记块）
- `docs/monitor/USER_GUIDE.md`（写入/刷新“每月一次”标记块）

## 失败处理

如果命令报错按以下顺序排查：

1. `LANGSMITH_API_KEY` 是否存在于项目根目录 `.env`。
2. 模型是否正确加载 `.env`（脚本已自动加载，但仍需确认 key 未过期）。
3. `project` 名称是否正确（LangSmith project name 区分大小写）。
4. 网络是否可访问 `api.smith.langchain.com`。

## 输出模板（完整报告）

按以下结构输出，不省略关键段落：

1. **7天基线**
   - Total Traces
   - Error Rate
   - Total Cost (USD)
   - RAG Hit Rate
   - Latency P95
   - 主导模型 + token 占比
2. **Top-N 最贵 Trace 表格**
   - rank / trace_id 前8位 / cost / latency / scenario / brief
3. **模式归纳**
   - 成本集中度（Top-N 占比）
   - 高频高成本场景
   - 延迟异常与成本的关联
4. **优化建议（至少 3 条）**
   - 现状问题
   - 修改位置（文件路径）
   - 预期收益（降本或性能）
   - 风险
   - 回滚策略
5. **优先级**
   - 本周先做
   - 下周再做
   - 暂缓项

## 文档落地规则

如果用户要求“写入文档”，默认同步以下文件：

- `docs/monitor/COST_OPTIMIZATION_PLAYBOOK.md`
- `docs/monitor/PROGRESS.md`（追加 Top-3 后续动作）
- `docs/monitor/USER_GUIDE.md`（追加月度反馈环 SOP，若尚未存在）

## 快速命令示例

- 最近 24 小时：

```bash
uv run --project packages/agent python .cursor/skills/langsmith-cost-review/scripts/pull_langsmith_metrics.py --project plan2code-agent --days 1 --top 10
```

- 最近 30 天，取 Top-20：

```bash
uv run --project packages/agent python .cursor/skills/langsmith-cost-review/scripts/pull_langsmith_metrics.py --project plan2code-agent --days 30 --top 20
```
