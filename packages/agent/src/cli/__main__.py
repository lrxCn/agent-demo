"""本地交互 CLI：须设置 PLAN2CODE_AGENT_CLI_MODE=1，以使用带 Redis checkpoint 的编译图。"""
import os
import sys
import time

from langchain_core.messages import HumanMessage
from prompt_toolkit import PromptSession


def _reconfigure_stdio_utf8() -> None:
    """尽量将标准流设为 UTF-8，与 PYTHONIOENCODING 双保险。"""
    for stream in (sys.stdin, sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            try:
                stream.reconfigure(encoding='utf-8')
            except OSError:
                pass


def _require_cli_mode() -> None:
    v = os.environ.get('PLAN2CODE_AGENT_CLI_MODE', '').strip().lower()
    if v not in ('1', 'true', 'yes', 'on'):
        print(
            '错误：未设置 PLAN2CODE_AGENT_CLI_MODE。\n'
            '请使用「pnpm dev:agentLocal」启动，或先将该环境变量设为 1。'
        )
        sys.exit(1)


def main() -> None:
    _reconfigure_stdio_utf8()
    _require_cli_mode()
    from src.infra_check import ensure_infra_or_exit

    ensure_infra_or_exit()
    # 在确认环境变量后再导入 graph，以便 builder 走 Redis 分支
    from src.graph.builder import graph
    from src.graph.invoke_timing import current_invoke_timing, reset_invoke_timing

    thread_id = os.environ.get('PLAN2CODE_AGENT_THREAD_ID', 'cli-local')
    mem0_user_id = os.environ.get('PLAN2CODE_AGENT_MEM0_USER', 'cli')
    config = {'configurable': {'thread_id': thread_id}}

    print(
        '本地 Agent CLI（Redis checkpoint）。输入 exit / quit / /q 结束。\n',
        flush=True,
    )
    session = PromptSession(message='你: ')
    while True:
        try:
            line = session.prompt().strip()
        except (EOFError, KeyboardInterrupt):
            print('\n再见。')
            break
        if not line:
            continue
        if line.lower() in ('exit', 'quit', '/q'):
            print('再见。')
            break
        try:
            reset_invoke_timing()
            t0 = time.perf_counter()
            result = graph.invoke(
                {
                    'messages': [HumanMessage(content=line)],
                    'mem0_user_id': mem0_user_id,
                    'thread_id': thread_id,
                    'available_frontend_tools': [],
                },
                config=config,
            )
            elapsed = time.perf_counter() - t0
        except Exception as e:
            print(f'调用失败: {e}\n')
            continue
        last = result['messages'][-1]
        content = getattr(last, 'content', None) or str(last)
        print(f'助手: {content}')
        acc = current_invoke_timing()
        if acc is not None:
            llm_s = acc.llm_seconds
            tool_s = acc.tool_seconds
            other_s = max(0.0, elapsed - llm_s - tool_s)
            print(
                '（耗时：'
                f'总计 {elapsed:.2f}s；'
                f'LLM {llm_s:.2f}s；'
                f'工具 {tool_s:.2f}s；'
                f'其余 {other_s:.2f}s — 图调度、序列化、Redis checkpoint 等）\n',
                flush=True,
            )
        else:
            print(f'（本轮 graph.invoke 耗时 {elapsed:.2f}s）\n', flush=True)


if __name__ == '__main__':
    main()
