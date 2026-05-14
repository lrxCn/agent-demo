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
