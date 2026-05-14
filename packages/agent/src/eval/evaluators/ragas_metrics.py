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
