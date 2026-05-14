"""输出 PII / 敏感词扫描（输出侧 Guardrail）。

- PII 正则硬编码（合规要求，不可关闭）：身份证 / 手机号 / 邮箱 / 银行卡
- 敏感词从 packages/agent/guardrails/sensitive.yaml 热加载
- 命中 → 替换为 ***，返回 FilterResult(hit=True, replacements=[...])
"""
from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

logger = logging.getLogger(__name__)

_SENSITIVE_YAML = Path(__file__).resolve().parent.parent.parent / 'guardrails' / 'sensitive.yaml'

# PII 正则（硬编码）
_PII_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (
        'china_id_card',
        re.compile(r'\b[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9Xx]\b'),
    ),
    (
        'china_phone',
        re.compile(r'(?<!\d)1[3-9]\d{9}(?!\d)'),
    ),
    (
        'email',
        re.compile(r'\b[\w.+-]+@[\w-]+\.[\w.-]+\b'),
    ),
    (
        'bank_card',
        re.compile(r'(?<!\d)\d{16,19}(?!\d)'),
    ),
]


@dataclass
class FilterResult:
    hit: bool
    sanitized: str
    replacements: list[str] = field(default_factory=list)  # 类别名，如 ['china_phone', 'sensitive_word']


class _SensitiveCache:
    def __init__(self, yaml_path: Path) -> None:
        self.yaml_path = yaml_path
        self._lock = threading.Lock()
        self._mtime: float = 0.0
        self._substrings: list[str] = []

    def _load_if_stale(self) -> None:
        try:
            mtime = self.yaml_path.stat().st_mtime
        except FileNotFoundError:
            with self._lock:
                self._mtime = 0
                self._substrings = []
            return
        if mtime == self._mtime:
            return
        with self._lock:
            if mtime == self._mtime:
                return
            try:
                data: dict[str, Any] = yaml.safe_load(self.yaml_path.read_text(encoding='utf-8')) or {}
            except Exception as e:  # noqa: BLE001
                logger.warning('解析 sensitive.yaml 失败 path=%s err=%r', self.yaml_path, e)
                self._mtime = mtime
                return
            self._substrings = [str(s) for s in (data.get('substrings') or []) if s]
            self._mtime = mtime
            logger.info('敏感词已加载 substrings=%d', len(self._substrings))

    def substrings(self) -> list[str]:
        self._load_if_stale()
        return list(self._substrings)


_cache = _SensitiveCache(_SENSITIVE_YAML)


def sanitize(text: str) -> FilterResult:
    """对输出文本做 PII + 敏感词替换。"""
    if not text:
        return FilterResult(hit=False, sanitized=text)
    sanitized = text
    replacements: list[str] = []

    # 1) PII 正则
    for name, pat in _PII_PATTERNS:
        new_text, n = pat.subn('***', sanitized)
        if n > 0:
            sanitized = new_text
            replacements.append(name)

    # 2) 敏感词 substring（不区分大小写）
    for word in _cache.substrings():
        if not word:
            continue
        # 用 re.IGNORECASE + 转义保证大小写不敏感
        pat = re.compile(re.escape(word), re.IGNORECASE)
        new_text, n = pat.subn('***', sanitized)
        if n > 0:
            sanitized = new_text
            replacements.append('sensitive_word')

    return FilterResult(
        hit=bool(replacements),
        sanitized=sanitized,
        replacements=replacements,
    )


def reload() -> None:
    _cache._mtime = 0  # type: ignore[attr-defined]
    _cache._load_if_stale()

