"""长期记忆图节点：检索与持久化与 chat 解耦"""
import logging

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from src.graph.state import AgentState
from src.memory.long_term import save_memories, search_memories

logger = logging.getLogger(__name__)


def _last_human_text(messages: list[BaseMessage]) -> str:
    """取最近一条用户消息的纯文本"""
    for msg in reversed(messages):
        if isinstance(msg, HumanMessage):
            content = msg.content
            return content if isinstance(content, str) else str(content)
    return ''


def memory_search_node(state: AgentState) -> dict[str, list[str]]:
    """按当前对话与 user_id 检索 Mem0，结果写入 state 供 chat 注入系统提示"""
    user_id = (state.get('mem0_user_id') or '').strip()
    messages = state['messages']
    if not user_id:
        return {'retrieved_memories': []}

    query_text = _last_human_text(messages)
    if not query_text:
        return {'retrieved_memories': []}

    try:
        memories = search_memories(query_text, user_id)
    except Exception:
        logger.exception('长期记忆检索失败')
        memories = []
    return {'retrieved_memories': memories}


def memory_save_node(state: AgentState) -> dict[str, object]:
    """将本轮用户句与刚生成的助手回复写入 Mem0；失败仅打日志"""
    user_id = (state.get('mem0_user_id') or '').strip()
    if not user_id:
        return {}

    msgs = state['messages']
    if not msgs:
        return {}

    last_ai = msgs[-1]
    if not isinstance(last_ai, AIMessage):
        return {}

    last_human = next((m for m in reversed(msgs) if isinstance(m, HumanMessage)), None)
    if last_human is None:
        return {}

    user_content = _last_human_text(msgs)
    asst_content = last_ai.content
    asst_str = asst_content if isinstance(asst_content, str) else str(asst_content)

    try:
        save_memories(
            [
                {'role': 'user', 'content': user_content},
                {'role': 'assistant', 'content': asst_str},
            ],
            user_id=user_id,
        )
    except Exception:
        logger.exception('长期记忆保存失败')
    return {}
