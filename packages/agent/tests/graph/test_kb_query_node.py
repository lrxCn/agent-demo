"""kb_query_node 单元测试（Phase 8 / Step 3）"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from src.graph.kb_query_node import kb_query_node


def _state(messages, role_ids=("admin",)):
    return {
        "messages": messages,
        "mem0_user_id": "u1",
        "thread_id": "t1",
        "available_frontend_tools": [],
        "user_role_ids": list(role_ids),
    }


def test_returns_results_on_success():
    fake = [{"text": "陈可新简介…", "score": 0.85}]
    with patch("src.graph.kb_query_node.search_knowledge", return_value=fake) as m:
        out = kb_query_node(_state([HumanMessage(content="给我陈可新的信息")]))
        assert out == {"forced_kb_results": fake}
        m.assert_called_once()
        kwargs = m.call_args.kwargs
        assert kwargs["role_ids"] == ["admin"]


def test_empty_role_ids_returns_empty():
    with patch("src.graph.kb_query_node.search_knowledge") as m:
        out = kb_query_node(_state([HumanMessage(content="给我陈可新的信息")], role_ids=()))
        assert out == {"forced_kb_results": []}
        m.assert_not_called()  # 角色为空直接跳过


def test_no_human_message_returns_empty():
    out = kb_query_node(_state([AIMessage(content="你好")]))
    assert out == {"forced_kb_results": []}


def test_search_exception_swallowed():
    with patch("src.graph.kb_query_node.search_knowledge", side_effect=RuntimeError("boom")):
        out = kb_query_node(_state([HumanMessage(content="查一下学生")]))
        assert out == {"forced_kb_results": []}


def test_empty_results_returned_as_is():
    with patch("src.graph.kb_query_node.search_knowledge", return_value=[]):
        out = kb_query_node(_state([HumanMessage(content="查一下学生")]))
        assert out == {"forced_kb_results": []}


def test_timeout_guard_falls_back_to_empty():
    """模拟 retriever 卡住超过 10s，期望 fallback 为空数组。"""
    import time

    def slow(*args, **kwargs):
        time.sleep(15)
        return [{"text": "never reached"}]

    with patch("src.graph.kb_query_node.search_knowledge", side_effect=slow):
        out = kb_query_node(_state([HumanMessage(content="查一下学生")]))
        assert out == {"forced_kb_results": []}


@pytest.mark.parametrize(
    "role_ids",
    [
        ["admin"],
        ["student-viewer", "kb-reader"],
    ],
)
def test_role_ids_passed_through(role_ids):
    fake = [{"text": "x", "score": 0.5}]
    with patch("src.graph.kb_query_node.search_knowledge", return_value=fake) as m:
        kb_query_node(_state([HumanMessage(content="查一下学生")], role_ids=role_ids))
        assert m.call_args.kwargs["role_ids"] == role_ids
