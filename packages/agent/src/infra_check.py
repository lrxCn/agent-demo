"""启动前检查 Redis、Qdrant 是否可用；失败则打印说明并退出。"""

from __future__ import annotations

import os
import sys
import urllib.error
import urllib.request

import redis

from src.config.settings import QDRANT_HOST, QDRANT_PORT, REDIS_URL


def _skip_checks() -> bool:
    v = os.environ.get("PLAN2CODE_SKIP_INFRA_CHECK", "").strip().lower()
    return v in ("1", "true", "yes", "on")


def _check_redis() -> str | None:
    try:
        client = redis.from_url(REDIS_URL, socket_connect_timeout=2.0)
        client.ping()
        client.close()
        return None
    except Exception as e:
        return f"Redis（{REDIS_URL}）不可达: {e}"


def _check_qdrant() -> str | None:
    url = f"http://{QDRANT_HOST}:{QDRANT_PORT}/healthz"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            if resp.status != 200:
                return f"Qdrant（{QDRANT_HOST}:{QDRANT_PORT}）healthz 返回 HTTP {resp.status}"
        return None
    except urllib.error.HTTPError as e:
        return f"Qdrant（{QDRANT_HOST}:{QDRANT_PORT}）请求失败: HTTP {e.code}"
    except urllib.error.URLError as e:
        return f"Qdrant（{QDRANT_HOST}:{QDRANT_PORT}）不可达: {e.reason}"
    except Exception as e:
        return f"Qdrant（{QDRANT_HOST}:{QDRANT_PORT}）检查失败: {e}"


def collect_infra_errors() -> list[str]:
    """返回非空列表表示存在阻塞性错误（每项一条人类可读说明）。"""
    if _skip_checks():
        return []
    errors: list[str] = []
    if (msg := _check_redis()) is not None:
        errors.append(msg)
    if (msg := _check_qdrant()) is not None:
        errors.append(msg)
    return errors


def ensure_infra_or_exit() -> None:
    """依赖未就绪时打印错误并 sys.exit(1)。"""
    errors = collect_infra_errors()
    if not errors:
        return
    print(
        "错误：本地依赖未就绪，Agent 无法启动。\n"
        + "\n".join(f"  - {e}" for e in errors)
        + "\n\n请先启动 Redis 与 Qdrant，"
        "并确认 .env 中 REDIS_URL、QDRANT_HOST、QDRANT_PORT 与容器端口一致。\n"
        "若确需跳过检查（不推荐），可设置环境变量 PLAN2CODE_SKIP_INFRA_CHECK=1。\n",
        file=sys.stderr,
        flush=True,
    )
    sys.exit(1)


def main() -> int:
    """供 `python -m src.infra_check` 使用；0 成功，1 失败。"""
    ensure_infra_or_exit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
