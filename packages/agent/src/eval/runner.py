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


def _fetch_baseline_summary(experiment_name: str) -> dict[str, Any] | None:
    """从 LangSmith Experiments 拉取 baseline 实验的 evaluator 指标摘要。"""
    import requests

    api_key = os.environ.get('LANGSMITH_API_KEY')
    endpoint = os.environ.get(
        'LANGCHAIN_ENDPOINT', 'https://api.smith.langchain.com',
    ).rstrip('/')
    if not api_key:
        return None

    try:
        sess_resp = requests.get(
            f'{endpoint}/sessions',
            params={'name': experiment_name},
            headers={'x-api-key': api_key},
            timeout=15,
        )
        sess_resp.raise_for_status()
        sessions_data = sess_resp.json()
        sessions = (
            sessions_data
            if isinstance(sessions_data, list)
            else sessions_data.get('sessions', [])
            if isinstance(sessions_data, dict)
            else []
        )
        if not isinstance(sessions, list) or not sessions:
            print(
                f'WARN: baseline 实验 "{experiment_name}" 不存在或无访问权限',
                file=sys.stderr,
            )
            return None
        session_id = sessions[0].get('id')
        if not session_id:
            return None

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
    """终端打印 diff 表（无外部依赖，手动 ljust）。"""
    rows: list[tuple[str, str, str, str]] = []
    rows.append(('Metric', f'Baseline ({baseline_name})', 'Current', 'Δ'))
    rows.append(('---', '---', '---', '---'))

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

    widths = [max(len(str(r[i])) for r in rows) for i in range(4)]
    for row in rows:
        line = ' | '.join(str(row[i]).ljust(widths[i]) for i in range(4))
        print(line)

    print(
        f'\nerrors:  baseline={baseline.get("errors", "-")}  current={current.get("errors", "-")}',
    )
    print(
        f'total:   baseline={baseline.get("total", "-")}  current={current.get("total", "-")}',
    )


def run_eval(
    dataset_name: str,
    limit: int | None = None,
    baseline: str | None = None,
) -> dict[str, Any]:
    """主流程：跑一遍 dataset 评估，可选与 baseline 实验对比。"""
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
    project_name = os.environ.get('LANGCHAIN_PROJECT', 'plan2code-agent') + '-eval'
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
    return summary


def cli() -> None:
    parser = argparse.ArgumentParser(description='plan2code eval runner')
    parser.add_argument(
        '--dataset',
        required=True,
        help='LangSmith dataset 名（可用别名 bad/rag/tool）',
    )
    parser.add_argument('--limit', type=int, default=None, help='只跑前 N 条（调试用）')
    parser.add_argument(
        '--baseline',
        type=str,
        default=None,
        help='与该实验对比（LangSmith experiment name）',
    )
    argv = sys.argv[1:]
    if argv and argv[0] == '--':
        argv = argv[1:]
    args = parser.parse_args(argv)
    alias_map = {
        'bad': os.environ.get('LANGSMITH_DATASET_BAD_CASES', 'plan2code-bad-cases-v1'),
        'rag': os.environ.get('LANGSMITH_DATASET_RAG_CASES', 'plan2code-rag-cases-v1'),
        'tool': os.environ.get('LANGSMITH_DATASET_TOOL_CASES', 'plan2code-tool-cases-v1'),
    }
    dataset_name = alias_map.get(args.dataset, args.dataset)
    if args.baseline:
        print(f'NOTE: 将在 eval 完成后与 baseline 实验 "{args.baseline}" 对比', file=sys.stderr)
    run_eval(dataset_name, args.limit, args.baseline)


if __name__ == '__main__':
    cli()
