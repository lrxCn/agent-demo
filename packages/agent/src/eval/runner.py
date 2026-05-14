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
        help='与该实验对比（Step-5 启用，本 Step 暂不实现）',
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
        print('NOTE: --baseline 将在 Step 5 实现；本次忽略', file=sys.stderr)
    run_eval(dataset_name, args.limit)


if __name__ == '__main__':
    cli()
