# Phase 7-4 / Step 4：输出 PII / 敏感词扫描（输出侧 Guardrail）

## 上下文

Phase 7-4 第四步。在 `chat_node` 返回前，把 LLM 输出过一遍**正则脱敏 + 敏感词替换**，命中替换为 `***` 并 trace 留痕。本步**不**在 SSE 流中插入提示（避免污染前端 markdown 渲染），仅打日志 + trace。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §8 决策 #9 顺序
- `@docs/monitor/1.PRD.md` §5.4.4（输出 PII / 敏感词验收清单）
- `@docs/monitor/3.ARCHITECTURE.md` §2 P8
- `@packages/agent/src/graph/nodes.py` `chat_node`（输出处理点）
- `@packages/agent/src/guardrails/input_filter.py`（Step 3 产物，参考热加载缓存模式）

前置条件：

- Phase 7-4 / Step 1 / Step 2 / Step 3 完成（顺序锁死）

> ⚠️ 与 PRD 的小差异：PRD §5.4.4 说"在 SSE 流末尾追加 `{type:'token', content:'\n[安全提示]...'}`"。本 step 改为**只打 trace metadata + tag**，**不污染前端流**——脱敏后的内容用户能直接看到，但不展示"提示信息"，避免破坏 markdown 渲染。如果你想保留 PRD 原意，验证步骤里有可选路径说明怎么做。

## 任务

### 任务 1：新建敏感词 yaml

新建文件 `packages/agent/guardrails/sensitive.yaml`，**全文**：

```yaml
# 输出侧敏感词
# 命中规则：substring 包含（不区分大小写） → 整词替换为 ***

substrings:
  - "内部测试数据"
  - "调试模式"
  - "未发布功能"
  # 业务相关敏感词补充到这里

# 始终启用的 PII 正则（无法配置关闭，因为合规要求）
# 此处仅作为说明；实际正则在 output_filter.py 中硬编码
pii_documentation:
  - "中国身份证号（18 位）"
  - "中国大陆手机号（1[3-9]\\d{9}）"
  - "邮箱"
  - "中国银行卡号（16-19 位）"
```

### 任务 2：新建 `output_filter.py`

新建文件 `packages/agent/src/guardrails/output_filter.py`，**全文**：

```python
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
```

### 任务 3：在 `chat_node` return 前调用

修改 `@packages/agent/src/graph/nodes.py`。

#### 改动 3.1：import

```python
from src.guardrails import output_filter
```

（与 Step 3 的 `from src.guardrails import input_filter` 放一起）

#### 改动 3.2：在 `chat_node` 末尾过滤

找到 `chat_node` 结尾：

```python
    with track_llm_seconds():
        response = llm.invoke(messages)
    return {'messages': [response]}
```

**改为**：

```python
    with track_llm_seconds():
        response = llm.invoke(messages)

    # 监控体系 Phase 7-4 Step 4：输出 PII / 敏感词扫描
    raw_content = response.content if isinstance(response.content, str) else None
    if raw_content:
        filter_out = output_filter.sanitize(raw_content)
        if filter_out.hit:
            # 1) 替换 response 内容
            response = AIMessage(
                content=filter_out.sanitized,
                # 保留 tool_calls 不变
                tool_calls=getattr(response, 'tool_calls', None) or [],
            )
            # 2) trace 留痕
            if get_current_run_tree is not None:
                try:
                    run = get_current_run_tree()
                    if run is not None:
                        run.add_tags(['guardrail:output:pii'])
                        run.add_metadata(
                            {
                                'guardrail_output_replacements': filter_out.replacements,
                            },
                        )
                except Exception:  # noqa: BLE001
                    pass
            # 3) 占位：审计落库（Phase 7-4 Step 5 实现）
            # TODO Step-5: audit_client.log('pii_filtered', {...})

    return {'messages': [response]}
```

> ⚠️ `AIMessage` 重建需要保留 `tool_calls`。若 LLM 这一轮返回的是 tool_call（content 为空），上面 `raw_content` 是 None，会跳过过滤——这是正确的（tool_call 不会含 PII）。

### 任务 4：手工冒烟

```bash
cd packages/agent
uv run python -c "
from src.guardrails import output_filter
print(output_filter.sanitize('用户张三的手机号是 13812345678，邮箱是 zhangsan@example.com'))
print(output_filter.sanitize('这是内部测试数据，请勿外传'))
print(output_filter.sanitize('正常文本，不应替换'))
"
```

期望：

```
FilterResult(hit=True, sanitized='用户张三的手机号是 ***，邮箱是 ***', replacements=['china_phone', 'email'])
FilterResult(hit=True, sanitized='这是***，请勿外传', replacements=['sensitive_word'])
FilterResult(hit=False, sanitized='正常文本，不应替换', replacements=[])
```

## 验证

### 验证步骤 1：编译

```bash
cd packages/agent
uv run python -c "from src.guardrails import output_filter; from src.graph.nodes import chat_node; print('OK')"
```

### 验证步骤 2：手机号脱敏

启动三端。前端发：

```
请把这段电话簿用 markdown 表格列出：张三 13812345678，李四 18900001234
```

期望 AI 回复中手机号已被替换为 `***`（不是 11 位数字）。

LangSmith trace 顶部 Tags 应出现 `guardrail:output:pii`，metadata `guardrail_output_replacements` 含 `china_phone`。

### 验证步骤 3：身份证脱敏

```
张三的身份证号是 110101199001011234，请记录
```

AI 回复中身份证号应被 `***` 替换。

### 验证步骤 4：敏感词脱敏

前面在 yaml 里有 `内部测试数据`。让 AI 模拟一句：

```
请说一句 "这是内部测试数据的样本" 测试一下
```

AI 输出 → `这是***的样本`，trace tag `guardrail:output:pii`，metadata replacements 含 `sensitive_word`。

### 验证步骤 5：正常路径无副作用

发 `你好` → AI 正常回答；LangSmith trace **不应**有 `guardrail:output:pii` tag。

### （可选）保留 PRD 原意：在 SSE 流末尾追加安全提示

如果你**坚持要在前端展示"部分内容已脱敏"提示**，把任务 3.2 中"占位 TODO"那块替换为：

```python
            # 可选：在 messages 末尾追加一条小 SystemMessage 用于流终态展示
            # 注意：这会污染历史 messages，让后续轮次也看到这条提示。本 step 默认不做。
```

并在 backend `agent.service.ts` 的 SSE 流 yield 完最后一帧 `done` **之前**，从 metadata 读到 `guardrail_output_replacements` 时 yield 一条额外的 `token` payload `'\n[安全提示] 部分内容已脱敏'`。

**推荐保持本 step 默认行为**（仅 trace 留痕）。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| 手机号没替换 | 正则 `(?<!\d)` 没生效（如手机号前面紧贴中文 → 实际紧贴 `是 ` 空格，是 OK 的）| 手工 `python -c "import re; print(re.sub(r'(?<!\\d)1[3-9]\\d{9}(?!\\d)', '***', '13812345678'))"` 调试 |
| 邮箱误伤 | `\b` 在中英混排时不一定按预期切词 | 把 `\b` 边界改为 `(?<![\w.+-])` / `(?![\w.-])` 更稳 |
| `response.content` 是 list（多模态）| LangChain 新版 AIMessage 支持 list[Block] | 改 raw_content 提取逻辑：`isinstance(content, list)` 时拼接 text block |
| tool_call 轮 response 被脱敏 | 不应该会，content 是 None / 空 | 检查 `if raw_content:` 守卫 |

## 完成后

### 更新 PROGRESS.md

```
| 7-4-4 | Guardrails Step-4：输出 PII / 敏感词扫描 | ✅ | <今天日期> | output_filter.py（PII 正则 + sensitive.yaml 热加载）+ chat_node return 前 sanitize；命中 trace tag guardrail:output:pii + metadata replacements |
```

### git commit

```bash
git add packages/agent/src/guardrails/output_filter.py \
        packages/agent/guardrails/sensitive.yaml \
        packages/agent/src/graph/nodes.py \
        docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(monitor): phase-7-4 step-4 输出 PII / 敏感词扫描

- packages/agent/guardrails/sensitive.yaml (业务敏感词热加载源)
- src/guardrails/output_filter.py:
  * PII 正则硬编码: 中国身份证 / 中国大陆手机号 / 邮箱 / 银行卡 (16-19 位)
  * sensitive.yaml substring 热加载 (mtime 失效)
  * sanitize(text) → FilterResult(hit, sanitized, replacements)
- chat_node 末尾 response.content 过 sanitize:
  * 命中重建 AIMessage(保留 tool_calls)
  * trace add_tags([guardrail:output:pii]) + metadata
- DoD: 输出含手机号/身份证时自动脱敏为 ***；trace 留痕；正常对话不受影响

ref: docs/monitor/PROGRESS.md 7-4-4
EOF
)"
```

### 下一步

完成本 step 才能进入 Phase 7-4 / Step 5（审计日志落库）。Step 5 会把前面 4 个 step 的 `TODO Step-5: audit_client.log(...)` 注释全部接上真实落库代码。
