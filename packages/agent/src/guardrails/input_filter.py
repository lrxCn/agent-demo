"""Prompt-injection 关键字初筛（输入侧 Guardrail）。

策略：
  - substring 命中（lower-case 包含）
  - regex 命中
  - v1 仅警告：返回 FilterResult(hit=True, ...)；caller 在 messages 中追加 SystemMessage
  - 黑名单从 packages/agent/guardrails/blacklist.yaml 热加载（mtime 检查）
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

# 黑名单 yaml 路径（相对仓库根 / package 根均支持）
_DEFAULT_YAML = Path(__file__).resolve().parent.parent.parent / 'guardrails' / 'blacklist.yaml'


@dataclass
class FilterResult:
    hit: bool
    matched_keywords: list[str] = field(default_factory=list)
    severity: str = 'warn'  # v1 永远 warn；v2 可升 block


class _BlacklistCache:
    """带 mtime 失效的黑名单缓存（线程安全）"""

    def __init__(self, yaml_path: Path) -> None:
        self.yaml_path = yaml_path
        self._lock = threading.Lock()
        self._mtime: float = 0.0
        self._substrings: list[str] = []
        self._patterns: list[re.Pattern[str]] = []

    def _load_if_stale(self) -> None:
        try:
            mtime = self.yaml_path.stat().st_mtime
        except FileNotFoundError:
            with self._lock:
                self._mtime = 0
                self._substrings = []
                self._patterns = []
            return
        if mtime == self._mtime:
            return
        with self._lock:
            if mtime == self._mtime:
                return
            try:
                data: dict[str, Any] = yaml.safe_load(self.yaml_path.read_text(encoding='utf-8')) or {}
            except Exception as e:  # noqa: BLE001
                logger.warning('解析黑名单 yaml 失败 path=%s err=%r', self.yaml_path, e)
                self._mtime = mtime
                return
            self._substrings = [str(s).lower() for s in (data.get('substrings') or [])]
            patterns_raw = data.get('regex') or []
            self._patterns = []
            for p in patterns_raw:
                try:
                    self._patterns.append(re.compile(str(p), re.IGNORECASE))
                except re.error as re_err:
                    logger.warning('编译黑名单正则失败 pattern=%r err=%r', p, re_err)
            self._mtime = mtime
            logger.info(
                '黑名单已加载 substrings=%d regex=%d',
                len(self._substrings),
                len(self._patterns),
            )

    def check(self, text: str) -> list[str]:
        self._load_if_stale()
        if not text:
            return []
        lower = text.lower()
        matched: list[str] = []
        for s in self._substrings:
            if s and s in lower:
                matched.append(s)
        for pat in self._patterns:
            if pat.search(text):
                matched.append(pat.pattern)
        return matched


_cache = _BlacklistCache(_DEFAULT_YAML)


def check(text: str) -> FilterResult:
    """主入口：扫描 text，返回是否命中。v1 永远是 warn（caller 仅警告不拒绝）。"""
    matched = _cache.check(text or '')
    if not matched:
        return FilterResult(hit=False)
    return FilterResult(hit=True, matched_keywords=matched, severity='warn')


def reload() -> None:
    """主动重载黑名单（测试 / SIGHUP handler 用）"""
    _cache._mtime = 0  # type: ignore[attr-defined]
    _cache._load_if_stale()

