# Phase 7-3 / Step 5：Eval `--baseline` 跑分对比（DoD-3）

## 上下文

Phase 7-3 收尾步骤。给 `runner.py` 加 `--baseline <experiment_name>` 参数，从 LangSmith Experiments 取上一次实验的 metrics，与本次跑分逐项 diff，终端输出三列表（修改前 / 修改后 / Δ）。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §9 DoD-3
- `@docs/monitor/1.PRD.md` §5.3.5
- `@docs/monitor/PROGRESS.md`
- `@packages/agent/src/eval/runner.py`（Step 1 / Step 4 产物，本步要扩展）

前置条件：

- Phase 7-3 / Step 1~4 已完成
- 至少跑过一次 eval（用 smoke dataset 或 bad-cases dataset 都行），LangSmith Experiments 页面已有历史实验

## 任务

### 任务 1：扩展 `runner.py` 的 baseline 逻辑

修改 `@packages/agent/src/eval/runner.py`。

#### 改动 1.1：import 与辅助函数

在 import 区追加：

```python
from typing import Optional  # 如果还没有
```

在 `_aggregate_results` 函数之后**新增**：

```python
def _fetch_baseline_summary(experiment_name: str) -> dict[str, Any] | None:
    """从 LangSmith Experiments 拉取 baseline 实验的 evaluator 指标摘要。

    LangSmith REST 路径：
        GET /sessions?name=<experiment_name>   → 拿 session_id
        GET /sessions/{session_id}/stats        → 拿聚合 stats（包含 feedback_stats）

    返回 dict 形如：{key+"_avg": float, key+"_count": int}；
    若失败返回 None。
    """
    import requests  # 复用 ragas 间接依赖的 requests；如未装请 uv add requests

    api_key = os.environ.get('LANGSMITH_API_KEY')
    endpoint = os.environ.get('LANGCHAIN_ENDPOINT', 'https://api.smith.langchain.com').rstrip('/')
    if not api_key:
        return None

    try:
        # 1. 按 name 查 session
        sess_resp = requests.get(
            f'{endpoint}/sessions',
            params={'name': experiment_name},
            headers={'x-api-key': api_key},
            timeout=15,
        )
        sess_resp.raise_for_status()
        sessions = sess_resp.json()
        if not isinstance(sessions, list) or not sessions:
            print(
                f'WARN: baseline 实验 "{experiment_name}" 不存在或无访问权限',
                file=sys.stderr,
            )
            return None
        session_id = sessions[0].get('id')
        if not session_id:
            return None

        # 2. 拉 stats
        stats_resp = requests.get(
            f'{endpoint}/sessions/{session_id}/stats',
            headers={'x-api-key': api_key},
            timeout=15,
        )
        stats_resp.raise_for_status()
        stats = stats_resp.json()
        feedback_stats = stats.get('feedback_stats') or {}

        summary: dict[str, Any] = {}
        for key, payload in feedback_stats.items():
            if not isinstance(payload, dict):
                continue
            avg = payload.get('avg')
            cnt = payload.get('n') or payload.get('count')
            if avg is not None:
                summary[f'{key}_avg'] = round(float(avg), 4)
            if cnt is not None:
                summary[f'{key}_count'] = int(cnt)
        return summary
    except Exception as e:  # noqa: BLE001
        print(f'WARN: 拉取 baseline 失败: {e!r}', file=sys.stderr)
        return None


def _print_diff_table(
    current: dict[str, Any],
    baseline: dict[str, Any],
    baseline_name: str,
) -> None:
    """终端打印 diff 表（无外部依赖，手动 ljust）"""
    rows: list[tuple[str, str, str, str]] = []
    rows.append(('Metric', f'Baseline ({baseline_name})', 'Current', 'Δ'))
    rows.append(('---', '---', '---', '---'))

    # 只显示 _avg 指标（最有意义）；errors / total 单独一行
    keys = sorted(
        set(k for k in current.keys() if k.endswith('_avg'))
        | set(k for k in baseline.keys() if k.endswith('_avg')),
    )
    for key in keys:
        cur = current.get(key)
        base = baseline.get(key)
        cur_str = f'{cur:.4f}' if isinstance(cur, (int, float)) else '-'
        base_str = f'{base:.4f}' if isinstance(base, (int, float)) else '-'
        if isinstance(cur, (int, float)) and isinstance(base, (int, float)):
            delta = cur - base
            arrow = '↑' if delta > 0 else ('↓' if delta < 0 else '=')
            delta_str = f'{arrow} {delta:+.4f}'
        else:
            delta_str = '-'
        rows.append((key, base_str, cur_str, delta_str))

    # 计算列宽
    widths = [max(len(str(r[i])) for r in rows) for i in range(4)]
    for row in rows:
        line = ' | '.join(str(row[i]).ljust(widths[i]) for i in range(4))
        print(line)

    # 额外行：errors / total
    print(
        f'\nerrors:  baseline={baseline.get("errors", "-")}  current={current.get("errors", "-")}',
    )
    print(
        f'total:   baseline={baseline.get("total", "-")}  current={current.get("total", "-")}',
    )
```

#### 改动 1.2：改 `run_eval` 接受 baseline，返回 summary 后调 diff

把原 `run_eval` 函数签名改为：

```python
def run_eval(
    dataset_name: str,
    limit: int | None = None,
    baseline: str | None = None,
) -> dict[str, Any]:
    """主流程：跑一遍 dataset 评估，可选与 baseline 实验对比。"""
```

并在原函数末尾的 `return summary` **之前**追加：

```python
    if baseline:
        baseline_summary = _fetch_baseline_summary(baseline)
        if baseline_summary is not None:
            print(f'\n>>> 与 baseline 实验 "{baseline}" 对比：\n')
            _print_diff_table(summary, baseline_summary, baseline)
        else:
            print(
                f'>>> 无法拉取 baseline "{baseline}"，跳过 diff（见上方 WARN）',
                file=sys.stderr,
            )
```

#### 改动 1.3：改 `cli()` 把 baseline 传下去

把 `cli()` 末尾改为：

```python
    if args.baseline:
        print(f'NOTE: 将在 eval 完成后与 baseline 实验 "{args.baseline}" 对比', file=sys.stderr)
    run_eval(dataset_name, args.limit, args.baseline)
```

> 注意：Step 4 中已把这段 `print('NOTE: --baseline 将在 Step 5 实现...')` 改掉。如果你执行 Step 4 时跳过了改这一处，本步要确保 `cli()` 中**不再有**那行 `本次忽略` 的提示。

### 任务 2：确保 `requests` 依赖可用

`requests` 一般已被 langchain 间接依赖。验证：

```bash
cd packages/agent
uv run python -c "import requests; print(requests.__version__)"
```

若报错 ImportError：

```bash
uv add requests
```

## 验证

### 验证步骤 1：编译

```bash
cd packages/agent
uv run python -c "from src.eval.runner import _fetch_baseline_summary, _print_diff_table; print('OK')"
```

期望 `OK`。

### 验证步骤 2：跑首次 eval，记录 experiment 名

```bash
# 终端：monorepo 根
pnpm eval:run -- --dataset plan2code-smoke-v1 --limit 2
```

终端输出末尾的 LangSmith 链接（或 Web 端 Experiments 列表）能看到实验名形如：

```
plan2code-eval-abc12345
```

**复制这个实验名**。

### 验证步骤 3：跑第二次 eval，用 --baseline 指向第一次

故意改一下 prompt 或工具列表（让分数稍变），或直接再跑一次（结果会很接近，但 diff 表能呈现 0 改动也算成功）：

```bash
pnpm eval:run -- --dataset plan2code-smoke-v1 --limit 2 --baseline plan2code-eval-abc12345
```

期望终端在 JSON 摘要之后打印 diff 表，形如：

```
>>> 与 baseline 实验 "plan2code-eval-abc12345" 对比：

Metric                       | Baseline (plan2code-eval-abc12345) | Current | Δ
---                          | ---                                | ---     | ---
llm_judge_score_avg          | 0.7234                             | 0.7345  | ↑ +0.0111
ragas_answer_relevancy_avg   | 1.0000                             | 1.0000  | = +0.0000
ragas_context_precision_avg  | 1.0000                             | 1.0000  | = +0.0000
ragas_faithfulness_avg       | 1.0000                             | 1.0000  | = +0.0000
tool_call_match_avg          | 1.0000                             | 1.0000  | = +0.0000
tool_call_match_count        | -                                  | -       | -

errors:  baseline=0  current=0
total:   baseline=2  current=2
```

### 验证步骤 4：DoD-3 闭环

把"修改前 / 修改后 / Δ"截图 → 沉淀到 `USER_GUIDE.md` §3（如果该段已存在），作为 SOP 示例：

```markdown
### Eval 跑分对比示例

```bash
pnpm eval:run -- --dataset bad --baseline <上一次实验名>
```

期望输出（示例）：

<贴上面的 diff 表截图或文本>
```

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| `WARN: baseline 实验 "..." 不存在` | 实验名拼写错 | LangSmith → Experiments 页面右键复制实验名 |
| `WARN: 拉取 baseline 失败: HTTPError(401)` | API key 没有读 sessions 的权限 | 重新生成 Member-level API key |
| diff 表所有列对齐崩了 | 实验名太长 | 这是输出美观问题，不阻断功能；可缩短实验名 |
| `feedback_stats` 为空，导致 baseline summary 是 `{}` | 历史实验跑的时候 evaluator 全失败/全无 score | 重新跑一次首次 eval（确认有 score）作为新 baseline |
| ImportError: requests | 没装 | `cd packages/agent && uv add requests` |

## 完成后

### 更新 PROGRESS.md

#### 7-3-5 标 ✅

```
| 7-3-5 | Eval `--baseline` 跑分对比 | ✅ | <今天日期> | runner.py 加 _fetch_baseline_summary + _print_diff_table；CLI --baseline 输出 4 列 diff 表 |
```

#### Phase 7-3 整体标 ✅

```
## Phase 7-3：Bad Case + Eval（目标 3，P1）

**整体：✅ 已完成（<今天日期>）**（实际工期：X 天）
```

#### DoD-3 标 ✅

```
| DoD-3 | eval 跑分 | ✅ | pnpm eval:run --baseline 输出 diff 表 |
```

### git commit

```bash
git add packages/agent/src/eval/runner.py \
        docs/monitor/USER_GUIDE.md \
        docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(monitor): phase-7-3 step-5 eval baseline diff 跑分对比

- runner.py 新增:
  * _fetch_baseline_summary(experiment_name): 从 LangSmith /sessions/{id}/stats
    拉 feedback_stats 转 evaluator 摘要
  * _print_diff_table(current, baseline, name): 终端 4 列对比表 (含 ↑/↓/= 箭头)
- run_eval() 加 baseline 参数；cli() 透传 --baseline
- USER_GUIDE.md §3 沉淀 Eval 跑分对比 SOP 示例
- Phase 7-3 全部完成；DoD-3 ✅

ref: docs/monitor/PROGRESS.md Phase 7-3
EOF
)"
```

### 下一步

Phase 7-3 完成后，按 PROGRESS 依赖图：

- 进入 **Phase 7-4**（Guardrails 安全边界，5 个 step，**顺序锁死**：配额 → 工具白名单 → input filter → output PII → 审计落库）
- 这是 v1 工作量最大的 phase（2.5 天）

Phase 7-3 完成后也可以**先跑一周看看板**积累真实数据，再启动 Phase 7-4——这样 7-4 上线后能用真实 bad case 验证安全规则的副作用。
