"""Step 4-3 自测脚本

用法：
  1. 先启动 Agent：cd packages/agent && uv run langgraph dev
  2. 另开终端运行：cd packages/agent && uv run python test_frontend_tools.py

测试逻辑：
  - 创建 thread → 发送包含前端工具的对话 → 检查 AI 是否返回 tool_call
"""
import json
import httpx

BASE = "http://127.0.0.1:2024"


def create_thread() -> str:
    r = httpx.post(f"{BASE}/threads", json={})
    r.raise_for_status()
    return r.json()["thread_id"]


def stream_chat(thread_id: str, message: str, frontend_tools: list[str]):
    """发送消息并打印 SSE 流"""
    body = {
        "assistant_id": "agent",
        "input": {
            "messages": [{"role": "user", "content": message}],
            "mem0_user_id": "test-user",
            "thread_id": thread_id,
            "available_frontend_tools": frontend_tools,
        },
        "stream_mode": ["updates"],
    }
    print(f"\n{'='*60}")
    print(f"📨 用户: {message}")
    print(f"🔧 可用前端工具: {frontend_tools}")
    print(f"{'='*60}")

    with httpx.stream("POST", f"{BASE}/threads/{thread_id}/runs/stream", json=body, timeout=60) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if not line.strip():
                continue
            if line.startswith("data:"):
                data = line[5:].strip()
                if data == "[DONE]":
                    continue
                try:
                    parsed = json.loads(data)
                    # updates 模式下，检查 chat 节点的输出
                    if isinstance(parsed, list) and len(parsed) >= 2:
                        mode, payload = parsed[0], parsed[1]
                        if mode == "updates" and isinstance(payload, dict):
                            for node_name, node_output in payload.items():
                                if node_name == "chat" and isinstance(node_output, dict):
                                    msgs = node_output.get("messages", [])
                                    for msg in msgs:
                                        content = msg.get("content", "")
                                        tool_calls = msg.get("tool_calls", [])
                                        if content:
                                            print(f"\n🤖 AI 回复: {content[:200]}")
                                        if tool_calls:
                                            print(f"\n✅ AI 发起了 tool_call！")
                                            for tc in tool_calls:
                                                print(f"   工具: {tc.get('name')}")
                                                print(f"   参数: {json.dumps(tc.get('args', {}), ensure_ascii=False)}")
                                                print(f"   ID:   {tc.get('id')}")
                except json.JSONDecodeError:
                    pass


def main():
    print("🚀 Step 4-3 自测：前端工具 schema 是否被 Agent 正确识别\n")

    thread_id = create_thread()
    print(f"📎 Thread ID: {thread_id}")

    # 测试 1：不传前端工具 → AI 应该无法调用前端工具
    print("\n" + "─" * 60)
    print("【测试 1】不传前端工具，问导航相关问题")
    stream_chat(thread_id, "帮我打开学生管理页面", frontend_tools=[])

    # 新 thread 避免上下文污染
    thread_id2 = create_thread()

    # 测试 2：传入 navigate_to_page → AI 应该返回 tool_call
    print("\n" + "─" * 60)
    print("【测试 2】传入 navigate_to_page，再问导航")
    stream_chat(thread_id2, "帮我跳转到学生管理页面", frontend_tools=["navigate_to_page"])

    # 测试 3：传入学生相关工具 → AI 应该返回 create_student tool_call
    thread_id3 = create_thread()
    print("\n" + "─" * 60)
    print("【测试 3】传入 create_student，要求创建学生")
    stream_chat(
        thread_id3,
        "帮我创建一个学生，姓名张三，学号2024001，男，一班",
        frontend_tools=["create_student", "query_students"],
    )

    print("\n\n✨ 测试完成！")
    print("- 测试 1 应该没有 tool_call（无前端工具可用）")
    print("- 测试 2 应该有 navigate_to_page 的 tool_call")
    print("- 测试 3 应该有 create_student 的 tool_call")


if __name__ == "__main__":
    main()
