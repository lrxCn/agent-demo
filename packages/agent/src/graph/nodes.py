"""图节点定义"""
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.tools import BaseTool
from langchain_openai import ChatOpenAI

from src.config.settings import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL_NAME
from src.graph.retry import invoke_tool_with_retry
from src.graph.state import AgentState
from src.tools.registry import registry

TIMEOUT_SECONDS = 30

# 与 retry / tool 节点返回文案对齐，用于判断是否走 fallback
_FAILURE_MARKERS: tuple[str, ...] = (
    '⚠️',
    '❌',
    '⏱️',
    '调用超时',
    '未找到工具',
)


def _collect_trailing_tool_messages(state: AgentState) -> list[ToolMessage]:
    """取状态末尾连续的一段 ToolMessage（本轮工具输出）"""
    batch: list[ToolMessage] = []
    for msg in reversed(state['messages']):
        if isinstance(msg, ToolMessage):
            batch.append(msg)
        else:
            break
    batch.reverse()
    return batch


def _tool_message_indicates_failure(content: str) -> bool:
    return any(marker in content for marker in _FAILURE_MARKERS)


def after_tools(state: AgentState) -> str:
    """工具执行后：若本轮任一 ToolMessage 含失败标记则走 fallback，否则回 chat"""
    for msg in _collect_trailing_tool_messages(state):
        if _tool_message_indicates_failure(msg.content):
            return 'fallback'
    return 'chat'


def fallback_node(state: AgentState) -> dict[str, list[BaseMessage]]:
    """回退节点：本轮工具失败时汇总为一条友好 AI 说明"""
    failed = [
        m
        for m in _collect_trailing_tool_messages(state)
        if _tool_message_indicates_failure(m.content)
    ]
    if not failed:
        return {'messages': []}
    summary = '\n'.join(m.content for m in failed)
    return {
        'messages': [
            AIMessage(
                content=f'抱歉，操作遇到问题：\n{summary}\n\n请稍后重试。',
            ),
        ],
    }


def get_llm(tools: list[BaseTool] | None = None) -> ChatOpenAI:
    """获取 LLM 实例"""
    llm = ChatOpenAI(
        model=OPENAI_MODEL_NAME,
        base_url=OPENAI_BASE_URL,
        api_key=OPENAI_API_KEY,
        temperature=0,
    )
    if tools:
        llm = llm.bind_tools(tools)
    return llm


def _tool_call_parts(tool_call: object) -> tuple[str, dict[str, object], str]:
    """从 AI 消息的 tool_call 项解析 name / args / id"""
    if isinstance(tool_call, dict):
        name = str(tool_call.get('name', ''))
        raw_args = tool_call.get('args')
        args: dict[str, object] = (
            {k: v for k, v in raw_args.items()} if isinstance(raw_args, dict) else {}
        )
        call_id = str(tool_call.get('id', ''))
        return name, args, call_id
    name = str(getattr(tool_call, 'name', '') or '')
    raw_args = getattr(tool_call, 'args', None)
    args = (
        {k: v for k, v in raw_args.items()} if isinstance(raw_args, dict) else {}
    )
    call_id = str(getattr(tool_call, 'id', '') or '')
    return name, args, call_id


def chat_node(state: AgentState) -> dict[str, list[BaseMessage]]:
    """聊天节点"""
    tools = registry.get_tools(categories=['builtin'])
    llm = get_llm(tools=tools)
    response = llm.invoke(state['messages'])
    return {'messages': [response]}


def tool_node_with_retry(state: AgentState) -> dict[str, list[BaseMessage]]:
    """工具节点（带重试与总超时）"""
    last_message = state['messages'][-1]

    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        return {'messages': []}

    all_tools = registry.get_all_tools()
    tool_map = {t.name: t for t in all_tools}

    results: list[ToolMessage] = []
    for tool_call in last_message.tool_calls:
        tool_name, tool_input, tool_call_id = _tool_call_parts(tool_call)

        tool = tool_map.get(tool_name)
        if not tool:
            results.append(
                ToolMessage(
                    content=f'未找到工具: {tool_name}',
                    tool_call_id=tool_call_id,
                ),
            )
            continue

        def _run_tool() -> ToolMessage:
            return invoke_tool_with_retry(tool, tool_input, tool_call_id)

        pool = ThreadPoolExecutor(max_workers=1)
        try:
            future = pool.submit(_run_tool)
            try:
                results.append(future.result(timeout=TIMEOUT_SECONDS))
            except FuturesTimeout:
                results.append(
                    ToolMessage(
                        content=f'工具 {tool_name} 调用超时（{TIMEOUT_SECONDS} 秒）',
                        tool_call_id=tool_call_id,
                    ),
                )
        finally:
            # 避免 with 退出时 wait=True 一直等到 sleep 线程自然结束
            pool.shutdown(wait=False, cancel_futures=True)

    return {'messages': results}
