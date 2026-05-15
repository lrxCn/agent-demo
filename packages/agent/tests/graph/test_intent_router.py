"""intent_router 单元测试（Phase 8 / Step 2）"""
from __future__ import annotations

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from src.graph.intent_router import intent_router


def _state(messages):
    return {
        "messages": messages,
        "mem0_user_id": "u1",
        "thread_id": "t1",
        "available_frontend_tools": [],
    }


# ===== kb_query 命中（信息查询）=====

@pytest.mark.parametrize(
    "text",
    [
        "给我陈可新的信息",
        "查一下张三的资料",
        "李四是谁？",
        "王五的档案能看吗",
        "帮我了解一下这个学生",
        "查询一下他的履历",
        "介绍下这个班",
    ],
)
def test_kb_query_hit(text: str):
    assert intent_router(_state([HumanMessage(content=text)])) == "kb_query"


# ===== chat_direct（明确导航）=====

@pytest.mark.parametrize(
    "text",
    [
        "打开学生管理页面",
        "跳转到知识库列表",
        "帮我打开角色管理页",
        "进入用户管理模块",
    ],
)
def test_chat_direct_nav(text: str):
    assert intent_router(_state([HumanMessage(content=text)])) == "chat_direct"


# ===== 同时命中：信息查询优先 =====

def test_kb_query_when_both_hit():
    text = "查一下陈可新的信息，然后打开学生管理页面"
    assert intent_router(_state([HumanMessage(content=text)])) == "kb_query"


# ===== chat_direct 兜底 =====

@pytest.mark.parametrize(
    "text",
    [
        "你好",
        "今天天气怎么样",
        "1+1 等于几",
        "",
    ],
)
def test_chat_direct_default(text: str):
    assert intent_router(_state([HumanMessage(content=text)])) == "chat_direct"


# ===== 边界：取最近一条 HumanMessage，忽略 AIMessage =====

def test_take_only_last_human_message():
    msgs = [
        HumanMessage(content="打开学生管理页面"),
        AIMessage(content="已打开"),
        HumanMessage(content="给我陈可新的信息"),  # ← 这条才是判定依据
    ]
    assert intent_router(_state(msgs)) == "kb_query"


def test_no_human_message():
    assert intent_router(_state([AIMessage(content="你好")])) == "chat_direct"
