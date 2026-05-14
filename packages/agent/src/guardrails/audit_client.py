"""Agent 端审计日志客户端：HTTP 回调 backend /api/v1/internal/audit-log。

落库失败仅日志告警，不阻塞主链路。
"""
from __future__ import annotations

import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _endpoint() -> str | None:
    raw = os.environ.get('BACKEND_INTERNAL_URL', 'http://localhost:3000').rstrip('/')
    return f'{raw}/api/v1/internal/audit-log'


def _api_key() -> str | None:
    return os.environ.get('INTERNAL_API_KEY')


def log(
    event_type: str,
    *,
    trace_id: str = '',
    user_id: str = '',
    severity: str = 'info',
    payload: dict[str, Any] | None = None,
) -> None:
    """Fire-and-forget 风格的审计上报；同步 HTTP 请求（短超时）"""
    endpoint = _endpoint()
    api_key = _api_key()
    if not endpoint or not api_key:
        logger.debug('audit_client: 未配置 endpoint/key，跳过')
        return
    body = {
        'event_type': event_type,
        'severity': severity,
        'payload': payload or {},
    }
    if trace_id:
        body['trace_id'] = trace_id
    if user_id:
        body['user_id'] = user_id
    try:
        httpx.post(
            endpoint,
            json=body,
            headers={'x-internal-api-key': api_key},
            timeout=3.0,
        )
    except Exception as e:  # noqa: BLE001
        logger.warning('audit_client 上报失败 event=%s err=%r', event_type, e)
