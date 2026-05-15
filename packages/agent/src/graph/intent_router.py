"""意图路由（Phase 8 / Step 2）

只读 state.messages 中最近一条 HumanMessage，按规则法返回路由方向：
- 'kb_query'    : 命中信息查询关键词 → 走强制检索分支
- 'chat_direct' : 其余情况（含明确导航意图） → 直接进 chat
"""
from __future__ import annotations

import logging

from langchain_core.messages import HumanMessage

from src.graph.state import AgentState

logger = logging.getLogger(__name__)


# ===== 关键词词表（v1 规则法，谨慎收敛，宁缺毋滥） =====
# 命中即视为"信息查询意图"
INFO_QUERY_KEYWORDS: tuple[str, ...] = (
    "信息",
    "资料",
    "详情",
    "介绍",
    "是谁",
    "记录",
    "档案",
    "简介",
    "履历",
    "背景",
    "查一下",
    "查询",
    "了解一下",
    "知道",
)

# 命中即视为"明确导航意图"（仅当未同时命中 INFO_QUERY_KEYWORDS 时生效）
NAV_KEYWORDS: tuple[str, ...] = (
    "打开",
    "跳转",
    "去到",
    "进入",
    "切换到",
    "带我去",
    "前往",
)

# 命中即视为"导航的目标对象"，与 NAV_KEYWORDS 联合判定（避免"打开你的话匣子"被误判）
NAV_OBJECTS: tuple[str, ...] = (
    "页面",
    "管理页",
    "列表",
    "页",
    "模块",
)


def _last_human_text(state: AgentState) -> str:
    """取最近一条 HumanMessage 的纯文本。"""
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            content = msg.content
            return content if isinstance(content, str) else str(content)
    return ""


def _hit_info_query(text: str) -> bool:
    return any(kw in text for kw in INFO_QUERY_KEYWORDS)


def _hit_nav(text: str) -> bool:
    has_verb = any(kw in text for kw in NAV_KEYWORDS)
    has_object = any(obj in text for obj in NAV_OBJECTS)
    return has_verb and has_object


def intent_router(state: AgentState) -> str:
    """LangGraph 条件边路由函数。

    判定优先级：
      1) 命中信息查询关键词 → 'kb_query'（即便同时命中导航，也先检索）
      2) 命中明确导航意图 → 'chat_direct'
      3) 兜底 → 'chat_direct'

    本函数不写 state（条件边路由函数不应写 state），仅返回字符串。
    """
    text = _last_human_text(state).strip()
    if not text:
        logger.debug("intent_router: empty human text, default chat_direct")
        return "chat_direct"

    if _hit_info_query(text):
        logger.info("intent_router: kb_query (text=%s)", text[:60])
        return "kb_query"

    if _hit_nav(text):
        logger.info("intent_router: chat_direct (nav, text=%s)", text[:60])
        return "chat_direct"

    logger.info("intent_router: chat_direct (default, text=%s)", text[:60])
    return "chat_direct"
