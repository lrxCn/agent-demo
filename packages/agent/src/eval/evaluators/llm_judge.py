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
