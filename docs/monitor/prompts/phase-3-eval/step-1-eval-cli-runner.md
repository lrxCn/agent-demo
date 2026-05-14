# Phase 7-3 / Step 1：Eval CLI Runner + 3 个 evaluators（先把管道跑通）

## 上下文

Phase 7-3 第一步。**目标**：建立 `uv run eval` / `pnpm eval:run` 入口，能针对任意 LangSmith dataset 跑评估、输出指标报表。本步先用 LangSmith 内置示例数据集跑通管道；后续 Step 4 才接真实 bad case dataset。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §8 决策 #4 / #6（直推 LangSmith Dataset、仅手动 CLI）
- `@docs/monitor/1.PRD.md` §5.3.4（Eval CLI 验收清单）+ §5.3.5（baseline diff）
- `@docs/monitor/2.TECH_SELECTION.md` §4.3（evaluators 矩阵：LLM-as-judge / Ragas / structured comparison）
- `@docs/monitor/PROGRESS.md`
- `@packages/agent/pyproject.toml`（要新增 dependencies + scripts）
- `@.env`（已有 `OPENAI_LLM_AS_JUDGE`）
- `@package.json`（要加 `eval:run` 入口）

前置条件：

- Phase 7-1 / 7-2 已完成
- LangSmith 上已有至少一条 trace（不一定有 dataset，本步用内置示例）

## 任务

### 任务 1：添加依赖到 `pyproject.toml`

修改 `@packages/agent/pyproject.toml`，在 `dependencies` 列表中**追加**：

```toml
    "langsmith>=0.4.0",
    "ragas>=0.2.0",
```

> `langsmith` 一般作为 `langchain` 间接依赖已存在；显式声明 ≥0.4 是为了拿到 `client.evaluate()` API。
>
> `ragas` 是 RAG 评估专用包（faithfulness / answer_relevancy / context_precision）。如果遇到 ragas 与 langchain 版本冲突，**回退方案**：删掉 ragas 这条，先只跑 LLM-as-judge + tool_call_match 两个 evaluator。

并在文件**末尾**追加 `[project.scripts]` 区块：

```toml
[project.scripts]
eval = "src.eval.runner:cli"
```

> 这样安装后会生成一个可执行命令 `eval`；`uv run eval` 会调用 `src.eval.runner:cli` 函数。

### 任务 2：补齐 `.env.example`

修改 `@.env.example`，确认含以下两行（如已有则跳过；变量名要严格一致）：

```dotenv
# Eval - LLM-as-judge 评估器（与主模型分离，避免裁判员=运动员偏差）
OPENAI_LLM_AS_JUDGE=Pro/moonshotai/Kimi-K2.6
# Eval - LangSmith dataset 配置（首次 Phase 7-3 Step 4 后生效）
LANGSMITH_DATASET_BAD_CASES=plan2code-bad-cases-v1
LANGSMITH_DATASET_RAG_CASES=plan2code-rag-cases-v1
LANGSMITH_DATASET_TOOL_CASES=plan2code-tool-cases-v1
```

### 任务 3：创建 eval 目录骨架

新建以下 4 个空文件（Python 包初始化）：

```bash
mkdir -p packages/agent/src/eval/evaluators
touch packages/agent/src/eval/__init__.py
touch packages/agent/src/eval/evaluators/__init__.py
```

### 任务 4：新建 `evaluators/llm_judge.py`

新建文件 `packages/agent/src/eval/evaluators/llm_judge.py`，**全文**：

```python
"""LLM-as-judge 评估器：用 Kimi-K2.6 给主对话模型的输出打 0-1 分。

为什么用独立模型：避免"裁判员=运动员"偏差，让主链路 DeepSeek-V4-Flash 的输出
由另一个家族的强模型评分。
"""
from typing import Any

from langchain_openai import ChatOpenAI
from src.config import settings


def _judge_llm() -> ChatOpenAI:
    """构造评估专用 LLM（独立模型名，但共用 base_url / api_key）"""
    return ChatOpenAI(
        model=settings.OPENAI_LLM_AS_JUDGE,
        base_url=settings.OPENAI_BASE_URL,
        api_key=settings.OPENAI_API_KEY,
        temperature=0,
    )


_JUDGE_PROMPT_TEMPLATE = """你是一个严格的对话质量评估员。请根据用户问题与参考答案，给出 0~1 的分数。

[用户问题]
{question}

[参考答案]
{reference}

[模型输出]
{prediction}

评分标准：
- 1.0：模型输出与参考答案在事实和意图上完全一致
- 0.7~0.9：核心一致，细节略有偏差
- 0.3~0.6：方向正确但缺失关键信息或有事实错误
- 0.0~0.2：方向错误或完全无关

只输出一个 0~1 之间的浮点数（保留 2 位小数），不要任何解释。"""


def llm_judge_evaluator(
    run: Any,  # langsmith.schemas.Run
    example: Any,  # langsmith.schemas.Example
) -> dict[str, Any]:
    """LangSmith evaluator 协议：接收 (run, example)，返回 {key, score, comment}"""
    inputs = example.inputs or {}
    outputs = example.outputs or {}
    run_outputs = run.outputs or {}

    question = str(inputs.get('question') or inputs.get('message') or '')
    reference = str(outputs.get('answer') or outputs.get('reference') or '')
    prediction = str(
        run_outputs.get('answer')
        or run_outputs.get('output')
        or run_outputs.get('content')
        or '',
    )

    if not reference or not prediction:
        return {'key': 'llm_judge_score', 'score': 0.0, 'comment': '参考答案或模型输出缺失'}

    prompt = _JUDGE_PROMPT_TEMPLATE.format(
        question=question,
        reference=reference,
        prediction=prediction,
    )
    try:
        response = _judge_llm().invoke(prompt)
        content = response.content if isinstance(response.content, str) else str(response.content)
        score = float(content.strip())
        score = max(0.0, min(1.0, score))  # clamp
        return {'key': 'llm_judge_score', 'score': score, 'comment': content.strip()}
    except Exception as e:  # noqa: BLE001
        return {
            'key': 'llm_judge_score',
            'score': 0.0,
            'comment': f'评估失败: {e!r}',
        }
```

### 任务 5：新建 `evaluators/tool_call_match.py`

新建文件 `packages/agent/src/eval/evaluators/tool_call_match.py`，**全文**：

```python
"""工具调用结构对比评估器：判断实际工具调用是否与参考一致。

数据集 example.outputs 约定包含 expected_tool_calls 字段，形如：
    [{"name": "search_knowledge_base", "args": {"query": "..."}}]

实际 run.outputs.tool_calls 与之逐项比较：
    - 工具名集合一致 → +0.5
    - 每个工具的 args.keys() 一致 → +0.5
"""
from typing import Any


def _extract_tool_calls(payload: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not payload:
        return []
    raw = payload.get('tool_calls') or payload.get('expected_tool_calls') or []
    if not isinstance(raw, list):
        return []
    result: list[dict[str, Any]] = []
    for item in raw:
        if isinstance(item, dict):
            name = str(item.get('name') or item.get('tool') or '')
            args = item.get('args') if isinstance(item.get('args'), dict) else {}
            result.append({'name': name, 'args': args})
    return result


def tool_call_match_evaluator(
    run: Any,
    example: Any,
) -> dict[str, Any]:
    """LangSmith evaluator 协议：返回 {key: 'tool_call_match', score, comment}"""
    expected = _extract_tool_calls(example.outputs)
    actual = _extract_tool_calls(run.outputs)

    if not expected:
        # 数据集未声明 expected_tool_calls → 跳过（视为满分以免拉低 dataset 平均）
        return {'key': 'tool_call_match', 'score': 1.0, 'comment': 'no expected_tool_calls'}

    expected_names = {t['name'] for t in expected}
    actual_names = {t['name'] for t in actual}
    name_score = 0.5 if expected_names == actual_names else 0.0

    expected_arg_keys = {(t['name'], frozenset(t['args'].keys())) for t in expected}
    actual_arg_keys = {(t['name'], frozenset(t['args'].keys())) for t in actual}
    arg_score = 0.5 if expected_arg_keys == actual_arg_keys else 0.0

    total = name_score + arg_score
    comment = (
        f'expected_names={sorted(expected_names)} '
        f'actual_names={sorted(actual_names)} '
        f'name_score={name_score} arg_score={arg_score}'
    )
    return {'key': 'tool_call_match', 'score': total, 'comment': comment}
```

### 任务 6：新建 `evaluators/ragas_metrics.py`

新建文件 `packages/agent/src/eval/evaluators/ragas_metrics.py`，**全文**：

```python
"""Ragas 指标包装：faithfulness / answer_relevancy / context_precision。

仅当 dataset 的 example.inputs 中含 contexts (list[str]) 时启用；
否则该 evaluator 直接返回满分（不参与）。
"""
from typing import Any

try:
    from ragas import evaluate as _ragas_evaluate  # type: ignore[import-not-found]
    from ragas.metrics import answer_relevancy, context_precision, faithfulness  # type: ignore[import-not-found]
    from datasets import Dataset as _HFDataset  # type: ignore[import-not-found]
    _RAGAS_AVAILABLE = True
except ImportError:
    _RAGAS_AVAILABLE = False


def _make_ragas_row(run: Any, example: Any) -> dict[str, Any] | None:
    inputs = example.inputs or {}
    outputs = example.outputs or {}
    run_outputs = run.outputs or {}

    question = str(inputs.get('question') or inputs.get('message') or '')
    answer = str(run_outputs.get('answer') or run_outputs.get('output') or '')
    reference = str(outputs.get('answer') or outputs.get('reference') or '')
    contexts = inputs.get('contexts') or run_outputs.get('contexts') or []

    if not contexts or not isinstance(contexts, list):
        return None
    return {
        'question': question,
        'answer': answer,
        'contexts': [str(c) for c in contexts],
        'reference': reference,
    }


def ragas_faithfulness_evaluator(run: Any, example: Any) -> dict[str, Any]:
    """RAG 忠实度：答案是否基于 contexts，不编造"""
    if not _RAGAS_AVAILABLE:
        return {'key': 'ragas_faithfulness', 'score': 1.0, 'comment': 'ragas not installed'}
    row = _make_ragas_row(run, example)
    if row is None:
        return {'key': 'ragas_faithfulness', 'score': 1.0, 'comment': 'no contexts → skip'}
    try:
        ds = _HFDataset.from_list([row])
        result = _ragas_evaluate(ds, metrics=[faithfulness])
        score = float(result['faithfulness'][0])
        return {'key': 'ragas_faithfulness', 'score': score, 'comment': f'ragas={score:.3f}'}
    except Exception as e:  # noqa: BLE001
        return {'key': 'ragas_faithfulness', 'score': 0.0, 'comment': f'failed: {e!r}'}


def ragas_answer_relevancy_evaluator(run: Any, example: Any) -> dict[str, Any]:
    """答案与问题的相关性"""
    if not _RAGAS_AVAILABLE:
        return {'key': 'ragas_answer_relevancy', 'score': 1.0, 'comment': 'ragas not installed'}
    row = _make_ragas_row(run, example)
    if row is None:
        return {'key': 'ragas_answer_relevancy', 'score': 1.0, 'comment': 'no contexts → skip'}
    try:
        ds = _HFDataset.from_list([row])
        result = _ragas_evaluate(ds, metrics=[answer_relevancy])
        score = float(result['answer_relevancy'][0])
        return {'key': 'ragas_answer_relevancy', 'score': score, 'comment': f'ragas={score:.3f}'}
    except Exception as e:  # noqa: BLE001
        return {'key': 'ragas_answer_relevancy', 'score': 0.0, 'comment': f'failed: {e!r}'}


def ragas_context_precision_evaluator(run: Any, example: Any) -> dict[str, Any]:
    """检索精度：contexts 中真正相关的比例"""
    if not _RAGAS_AVAILABLE:
        return {'key': 'ragas_context_precision', 'score': 1.0, 'comment': 'ragas not installed'}
    row = _make_ragas_row(run, example)
    if row is None:
        return {'key': 'ragas_context_precision', 'score': 1.0, 'comment': 'no contexts → skip'}
    try:
        ds = _HFDataset.from_list([row])
        result = _ragas_evaluate(ds, metrics=[context_precision])
        score = float(result['context_precision'][0])
        return {'key': 'ragas_context_precision', 'score': score, 'comment': f'ragas={score:.3f}'}
    except Exception as e:  # noqa: BLE001
        return {'key': 'ragas_context_precision', 'score': 0.0, 'comment': f'failed: {e!r}'}
```

### 任务 7：新建主入口 `runner.py`

新建文件 `packages/agent/src/eval/runner.py`，**全文**：

```python
"""Eval CLI Runner：跑 LangSmith dataset，调用 plan2code 主图，汇总 evaluator 指标。

入口：
    uv run eval --dataset <name> [--limit <n>]
等价于：
    pnpm eval:run -- --dataset <name> [--limit <n>]

退出码：
    0 = 成功
    1 = LangSmith 未配置 / dataset 不存在 / 执行异常
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Any

from dotenv import load_dotenv

# 监控体系：必须先加载 .env，再 import LangSmith / LangChain
load_dotenv()

from langsmith import Client  # noqa: E402

from src.eval.evaluators.llm_judge import llm_judge_evaluator  # noqa: E402
from src.eval.evaluators.ragas_metrics import (  # noqa: E402
    ragas_answer_relevancy_evaluator,
    ragas_context_precision_evaluator,
    ragas_faithfulness_evaluator,
)
from src.eval.evaluators.tool_call_match import tool_call_match_evaluator  # noqa: E402


# 全部 evaluator（一次跑全部，每个 evaluator 内部处理"不适用即跳过满分"）
ALL_EVALUATORS = [
    llm_judge_evaluator,
    tool_call_match_evaluator,
    ragas_faithfulness_evaluator,
    ragas_answer_relevancy_evaluator,
    ragas_context_precision_evaluator,
]


def _build_target_app() -> Any:
    """构造可被 LangSmith Client.evaluate() 调用的 target：(inputs: dict) -> dict"""
    # 复用 plan2code 主图（与 langgraph dev 一致）
    from src.graph.builder import graph

    def _target(inputs: dict[str, Any]) -> dict[str, Any]:
        message = inputs.get('question') or inputs.get('message') or ''
        thread_id = inputs.get('thread_id') or 'eval-thread'
        mem0_user_id = inputs.get('mem0_user_id') or 'eval-user'
        state = {
            'messages': [{'role': 'user', 'content': str(message)}],
            'mem0_user_id': mem0_user_id,
            'thread_id': thread_id,
            'available_frontend_tools': inputs.get('available_frontend_tools') or [],
            'user_role_ids': inputs.get('user_role_ids') or [],
            'app_trace_id': inputs.get('app_trace_id') or '',
        }
        final_state = graph.invoke(state)
        # 取最后一条 AIMessage 文本
        msgs = final_state.get('messages') or []
        last = msgs[-1] if msgs else None
        answer = ''
        tool_calls: list[dict[str, Any]] = []
        if last is not None:
            content = getattr(last, 'content', '')
            answer = content if isinstance(content, str) else str(content)
            for tc in getattr(last, 'tool_calls', None) or []:
                if isinstance(tc, dict):
                    tool_calls.append(
                        {
                            'name': str(tc.get('name', '')),
                            'args': tc.get('args') if isinstance(tc.get('args'), dict) else {},
                        },
                    )
        return {
            'answer': answer,
            'tool_calls': tool_calls,
        }

    return _target


def _aggregate_results(results: Any) -> dict[str, Any]:
    """把 LangSmith evaluate() 返回的逐条结果聚合为指标摘要"""
    total = 0
    per_evaluator_scores: dict[str, list[float]] = {}
    errors = 0
    for r in results:
        total += 1
        if getattr(r, 'error', None) is not None:
            errors += 1
            continue
        feedbacks = r.get('evaluation_results', {}).get('results', []) if isinstance(r, dict) else []
        for fb in feedbacks:
            key = str(getattr(fb, 'key', '') or fb.get('key', ''))
            score_raw = getattr(fb, 'score', None)
            if score_raw is None and isinstance(fb, dict):
                score_raw = fb.get('score')
            if score_raw is None:
                continue
            per_evaluator_scores.setdefault(key, []).append(float(score_raw))
    summary: dict[str, Any] = {
        'total': total,
        'errors': errors,
    }
    for key, scores in per_evaluator_scores.items():
        if scores:
            summary[f'{key}_avg'] = round(sum(scores) / len(scores), 4)
            summary[f'{key}_count'] = len(scores)
    return summary


def run_eval(dataset_name: str, limit: int | None = None) -> dict[str, Any]:
    """主流程：跑一遍 dataset 评估，返回指标摘要 dict。"""
    if not os.environ.get('LANGSMITH_API_KEY'):
        print('ERROR: LANGSMITH_API_KEY 未配置；请检查 .env', file=sys.stderr)
        sys.exit(1)

    client = Client()
    try:
        client.read_dataset(dataset_name=dataset_name)
    except Exception as e:  # noqa: BLE001
        print(f'ERROR: dataset "{dataset_name}" 不存在或无权访问: {e!r}', file=sys.stderr)
        sys.exit(1)

    target = _build_target_app()
    project_name = (
        os.environ.get('LANGCHAIN_PROJECT', 'plan2code-agent') + '-eval'
    )
    eval_data: Any = dataset_name
    if limit is not None:
        eval_data = list(client.list_examples(dataset_name=dataset_name, limit=limit))
    print(f'>>> 运行 eval: dataset={dataset_name} limit={limit} project={project_name}')
    results = client.evaluate(
        target,
        data=eval_data,
        evaluators=ALL_EVALUATORS,
        experiment_prefix='plan2code-eval',
    )
    summary = _aggregate_results(results)
    print('\n>>> 评估完成 (results 已上报 LangSmith Experiments)')
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return summary


def cli() -> None:
    parser = argparse.ArgumentParser(description='plan2code eval runner')
    parser.add_argument('--dataset', required=True, help='LangSmith dataset 名称')
    parser.add_argument('--limit', type=int, default=None, help='只跑前 N 条（调试用）')
    parser.add_argument(
        '--baseline',
        type=str,
        default=None,
        help='与该实验对比（Step-5 启用，本 Step 暂不实现）',
    )
    args = parser.parse_args()
    if args.baseline:
        print('NOTE: --baseline 将在 Step 5 实现；本次忽略', file=sys.stderr)
    run_eval(args.dataset, args.limit)


if __name__ == '__main__':
    cli()
```

### 任务 8：根 `package.json` 加 `eval:run` 入口

修改 `@package.json`，在 `scripts` 中**追加**：

```json
    "eval:run": "cd packages/agent && uv run eval"
```

完整 scripts 块：

```json
  "scripts": {
    "dev:frontend": "pnpm -C packages/frontend dev",
    "dev:backend": "pnpm -C packages/backend start:dev",
    "dev:agent": "cd packages/agent && uv run python -m src.infra_check && uv run langgraph dev --port 8123",
    "dev:agentLocal": "cd packages/agent && PLAN2CODE_AGENT_CLI_MODE=1 PYTHONIOENCODING=utf-8 uv run python -m src.cli",
    "eval:run": "cd packages/agent && uv run eval"
  }
```

### 任务 9：安装新依赖

```bash
cd packages/agent
uv sync
```

期望看到 `langsmith` / `ragas` 新增。如果 ragas 安装失败，**先把 pyproject.toml 中那一行删掉**，evaluator 文件里已用 try/except 兜底，删除 ragas 不会让 runner 跑不起来。

## 验证

### 验证步骤 1：命令行帮助可见

```bash
cd packages/agent
uv run eval --help
```

期望输出 argparse 的 help 文本，包含 `--dataset`、`--limit`、`--baseline`。

### 验证步骤 2：构造一个手工 dataset 冒烟（**关键**）

由于真实 bad case dataset 要等 Step 4 才会自动生成，本步**手动**在 LangSmith 上建一个最小数据集冒烟：

1. 打开 https://smith.langchain.com → 左侧 **Datasets** → `+ New Dataset`
2. Name: `plan2code-smoke-v1`
3. 在 dataset 详情页点 `+ New Example`，**添加 2 条**；或直接用 `Upload from file` 上传：
   `docs/monitor/prompts/phase-3-eval/plan2code-smoke-v1.jsonl`

| Example 1 输入 | 输出 |
|---|---|
| `{"question": "你好"}` | `{"answer": "你好，我是 plan2code 助手"}` |

| Example 2 输入 | 输出 |
|---|---|
| `{"question": "2024 年是闰年吗"}` | `{"answer": "是闰年，因为 2024 能被 4 整除且不能被 100 整除"}` |

### 验证步骤 3：跑 eval

```bash
# monorepo 根目录
pnpm eval:run -- --dataset plan2code-smoke-v1 --limit 2
```

> 注意 `pnpm` 转发参数要用 `--`，否则 `--dataset` 会被 pnpm 自己吞掉。

期望输出（顺序大致如下）：

```
>>> 运行 eval: dataset=plan2code-smoke-v1 limit=2 project=plan2code-agent-eval
[langsmith.evaluation] Evaluating ...
... 中间会打几行 langsmith 进度 ...
>>> 评估完成 (results 已上报 LangSmith Experiments)
{
  "total": 2,
  "errors": 0,
  "llm_judge_score_avg": 0.7234,
  "llm_judge_score_count": 2,
  "tool_call_match_avg": 1.0,
  "tool_call_match_count": 2,
  "ragas_faithfulness_avg": 1.0,
  ...
}
```

### 验证步骤 4：LangSmith Experiments 页面

打开 https://smith.langchain.com → 左侧 **Experiments** → 应看到一条新的实验，名为 `plan2code-eval-<hash>`，点开能看到 2 条记录、含 evaluator 评分。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| `uv run eval` 报 `No such command` | `pyproject.toml` `[project.scripts]` 未生效 | `uv sync` 重装；或直接 `uv run python -m src.eval.runner --help` 验证 |
| `ImportError: ragas` | ragas 未安装或版本冲突 | 任务 1 删掉 `ragas>=0.2.0` 那行；evaluator 已有 try/except 兜底 |
| `ImportError: datasets` | ragas 依赖 huggingface datasets | `uv add datasets` 或同 ragas 一起删 |
| `ERROR: dataset "..." 不存在` | 名字打错 | 去 LangSmith Datasets 页面复制粘贴 |
| evaluator 全部输出 `score=0` | LangSmith Client 没拿到 OPENAI_API_KEY | 确认 `.env` 在 monorepo 根（`load_dotenv()` 默认会找上级）|
| `pnpm eval:run -- --dataset xxx` 看到 `unknown option --dataset` | 没加 `--` 前缀 | 必须 `pnpm eval:run -- --dataset xxx`（双横线分隔）|

## 完成后

### 更新 PROGRESS.md

```
| 7-3-1 | Eval CLI Runner（P6'） | ✅ | <今天日期> | src/eval/runner.py + 4 个 evaluator 文件；pyproject.toml [project.scripts] eval；package.json eval:run；用 plan2code-smoke-v1 冒烟通过 |
```

### git commit

```bash
git add packages/agent/pyproject.toml \
        packages/agent/src/eval/ \
        package.json \
        .env.example \
        docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(monitor): phase-7-3 step-1 Eval CLI Runner + 3 类 evaluators

- packages/agent/pyproject.toml: 加 langsmith / ragas 依赖
  + [project.scripts] eval = src.eval.runner:cli
- src/eval/runner.py 主入口（argparse + LangSmith Client.evaluate）
- src/eval/evaluators/llm_judge.py（Kimi-K2.6 评估器，独立模型避免裁判=运动员）
- src/eval/evaluators/tool_call_match.py（结构化对比 names + args.keys）
- src/eval/evaluators/ragas_metrics.py（faithfulness / answer_relevancy / context_precision，try-except 兜底）
- 根 package.json scripts.eval:run = cd packages/agent && uv run eval
- .env.example 加 OPENAI_LLM_AS_JUDGE + 3 个 LANGSMITH_DATASET_* 占位
- DoD: pnpm eval:run -- --dataset plan2code-smoke-v1 输出 JSON 摘要；
  LangSmith Experiments 页面可见一条新实验

ref: docs/monitor/PROGRESS.md 7-3-1
EOF
)"
```
