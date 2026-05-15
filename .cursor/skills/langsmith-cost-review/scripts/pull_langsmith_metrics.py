#!/usr/bin/env python3
"""从 LangSmith 拉取项目成本与性能指标，并可一键落文档。"""

from __future__ import annotations

import argparse
import json
import os
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from langsmith import Client


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pull LangSmith metrics")
    parser.add_argument("--project", default="plan2code-agent", help="LangSmith project name")
    parser.add_argument("--days", type=int, default=7, help="Time window in days")
    parser.add_argument("--top", type=int, default=10, help="Top N expensive traces")
    parser.add_argument(
        "--write-docs",
        action="store_true",
        help="将结果写入 docs/monitor 文档（Playbook/Progress/UserGuide）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="预览写入内容，不落盘",
    )
    parser.add_argument(
        "--version",
        default="v1.1",
        help="写入 Playbook 的版本号（仅 --write-docs 时生效）",
    )
    return parser.parse_args()


def load_env() -> None:
    # 以脚本路径为锚点定位仓库根目录，再加载 .env
    repo_root = Path(__file__).resolve().parents[4]
    load_dotenv(repo_root / ".env")


def get_tokens(run: Any) -> int:
    usage = getattr(run, "usage_metadata", None) or {}
    if isinstance(usage, dict):
        total = usage.get("total_tokens")
        if isinstance(total, (int, float)):
            return int(total)
        inp = usage.get("input_tokens")
        out = usage.get("output_tokens")
        if isinstance(inp, (int, float)) or isinstance(out, (int, float)):
            return int(inp or 0) + int(out or 0)

    prompt_tokens = getattr(run, "prompt_tokens", None)
    completion_tokens = getattr(run, "completion_tokens", None)
    if isinstance(prompt_tokens, (int, float)) or isinstance(completion_tokens, (int, float)):
        return int(prompt_tokens or 0) + int(completion_tokens or 0)
    return 0


def classify_scenario(run: Any) -> str:
    tags = set(getattr(run, "tags", None) or [])
    if "rag:hit" in tags or "rag:miss" in tags:
        return "RAG问答"

    inputs = getattr(run, "inputs", None) or {}
    if not isinstance(inputs, dict):
        return "常规对话"
    messages = inputs.get("messages")
    if not isinstance(messages, list) or not messages:
        return "常规对话"

    last_message = messages[-1]
    if not isinstance(last_message, dict):
        return "常规对话"

    content = last_message.get("content")
    text = ""
    if isinstance(content, str):
        text = content.strip()
    elif isinstance(content, list) and content:
        first = content[0]
        if isinstance(first, dict) and isinstance(first.get("text"), str):
            text = first["text"].strip()

    if len(text) <= 10:
        return "短消息"
    if any(key in text for key in ("知识库", "基于", "文档", "谁是", "关系")):
        return "知识问答"
    return "常规对话"


def extract_brief(run: Any) -> str:
    inputs = getattr(run, "inputs", None) or {}
    if not isinstance(inputs, dict):
        return "常规对话"
    messages = inputs.get("messages")
    if not isinstance(messages, list) or not messages:
        return "常规对话"

    last_message = messages[-1]
    if not isinstance(last_message, dict):
        return "常规对话"

    content = last_message.get("content")
    text = ""
    if isinstance(content, str):
        text = content.strip().replace("\n", " ")
    elif isinstance(content, list) and content:
        first = content[0]
        if isinstance(first, dict) and isinstance(first.get("text"), str):
            text = first["text"].strip().replace("\n", " ")

    return text[:30] if text else "常规对话"


def get_model_name(run: Any) -> str:
    extra = getattr(run, "extra", None) or {}
    if isinstance(extra, dict):
        metadata = extra.get("metadata")
        if isinstance(metadata, dict):
            for key in ("ls_model_name", "model_name", "model"):
                value = metadata.get(key)
                if isinstance(value, str) and value:
                    return value
    for key in ("model_name", "model", "name"):
        value = getattr(run, key, None)
        if isinstance(value, str) and value:
            return value
    return "unknown"


@dataclass
class TopTrace:
    rank: int
    trace_id_prefix: str
    cost_usd: float
    latency_s: float | None
    scenario: str
    brief: str


def format_cost(value: float) -> str:
    return f"${value:.6f}"


def estimate_monthly_saving(weekly_cost: float, ratio_low: float, ratio_high: float) -> str:
    monthly = weekly_cost * 4
    low = monthly * ratio_low
    high = monthly * ratio_high
    return f"${low:.1f} ~ ${high:.1f}/月"


def health_mark(value: float, threshold: float, operator: str) -> str:
    if operator == "lt":
        return "✅" if value < threshold else "❌"
    if operator == "gt":
        return "✅" if value > threshold else "❌"
    return "⚠️"


def render_playbook_markdown(result: dict[str, Any], version: str) -> str:
    summary = result["summary"]
    top_traces: list[dict[str, Any]] = result["top_traces"]
    total_cost = float(summary["total_cost_usd"])
    top_total = sum(float(item["cost_usd"]) for item in top_traces)
    top_avg = (top_total / len(top_traces)) if top_traces else 0.0
    top_share = (top_total / total_cost * 100) if total_cost > 0 else 0.0

    lines: list[str] = []
    lines.append(f"# plan2code 成本 & 性能优化 Playbook（{version}）")
    lines.append("")
    lines.append("> **本文档是“反馈环的右半边”**：左边是看板（看），右边是 Playbook（改）。")
    lines.append(">")
    lines.append(
        f"> 数据快照：{datetime.now().strftime('%Y-%m-%d')} 拉取 LangSmith Dashboard `plan2code-cost-overview` Last {result['window_days']} days。"
    )
    lines.append("")
    lines.append("## 1. 现状基线（7 天）")
    lines.append("")
    lines.append("| 指标 | 实际值 | 红线 | 健康度 |")
    lines.append("|---|---|---|---|")
    lines.append(f"| Total Traces | {summary['total_traces']} | n/a | n/a |")
    lines.append(
        f"| Error Rate | {summary['error_rate_pct']:.2f}% | < 5% | {health_mark(float(summary['error_rate_pct']), 5, 'lt')} |"
    )
    lines.append(
        f"| Total Cost | {format_cost(float(summary['total_cost_usd']))} | < $35/周 | {health_mark(float(summary['total_cost_usd']), 35, 'lt')} |"
    )
    lines.append(
        f"| RAG Hit Rate | {summary['rag_hit_rate_pct']:.2f}% | > 60% | {health_mark(float(summary['rag_hit_rate_pct']), 60, 'gt')} |"
    )
    lines.append(
        f"| Latency P95 | {summary['latency_p95_s']:.2f}s | < 15s | {health_mark(float(summary['latency_p95_s']), 15, 'lt')} |"
    )
    lines.append(
        f"| 主导模型 | `{summary['top_model']}` | n/a | {summary['top_model_token_share_pct']:.2f}% 总 token |"
    )
    lines.append("")
    lines.append("### 1.1 Top-10 最贵 trace 模式归纳")
    lines.append("")
    lines.append("| # | trace_id (前 8 位) | cost (USD) | latency (s) | 简要场景 |")
    lines.append("|---|---|---|---|---|")
    for item in top_traces:
        latency_text = f"{item['latency_s']:.2f}" if isinstance(item["latency_s"], (int, float)) else "n/a"
        lines.append(
            f"| {item['rank']} | {item['trace_id_prefix']} | {format_cost(float(item['cost_usd']))} | {latency_text} | {item['scenario']}：{item['brief']} |"
        )
    lines.append("")
    lines.append(
        f"Top-{len(top_traces)} 合计成本 {format_cost(top_total)}，占窗口总成本 {top_share:.2f}%，平均单条 {format_cost(top_avg)}。"
    )
    lines.append("高成本样本优先集中在 RAG/知识问答与长上下文请求，建议先做上下文体积与长尾延迟双优化。")
    lines.append("")
    lines.append("## 2. 候选优化项")
    lines.append("")
    lines.append("> **候选项 1 — RAG 检索结果数量调优**")
    lines.append("> - **现状成本**：高成本 trace 主要落在知识/RAG 场景。")
    lines.append(
        "> - **改进方案**：在 `packages/agent/src/rag/retriever.py` 将 `top_k` 下调（如 5→3），并加相似度阈值过滤。"
    )
    lines.append(
        f"> - **预期降本**：{estimate_monthly_saving(total_cost, 0.25, 0.35)}。"
    )
    lines.append("> - **实施工作量**：S")
    lines.append("> - **风险**：召回下降导致回答完整性下降。")
    lines.append("> - **回滚策略**：恢复原 `top_k`，并用 `pnpm eval:run -- --dataset rag --baseline <实施前实验名>` 校验。")
    lines.append("")
    lines.append("### 候选 2 — 系统提示词瘦身")
    lines.append("")
    lines.append("- **现状成本**：全量请求都承担固定系统提示开销。")
    lines.append(
        "- **改进方案**：在 `packages/agent/src/graph/nodes.py` 抽取并压缩系统提示；仅在 `retrieved_memories` 非空时注入记忆段。"
    )
    lines.append(f"- **预期降本**：{estimate_monthly_saving(total_cost, 0.10, 0.18)}。")
    lines.append("- **实施工作量**：S")
    lines.append("- **风险**：指令压缩可能造成风格和稳定性波动。")
    lines.append("- **回滚策略**：恢复旧 prompt 文本并对比 baseline。")
    lines.append("")
    lines.append("### 候选 3 — 短消息走更便宜模型")
    lines.append("")
    lines.append(
        f"- **现状成本**：`{summary['top_model']}` token 占比 {summary['top_model_token_share_pct']:.2f}%，缺少低复杂度分流。"
    )
    lines.append(
        "- **改进方案**：在 `packages/agent/src/graph/nodes.py` 增加短消息路由分支，引入 `.env` 变量 `OPENAI_MODEL_SHORT`。"
    )
    lines.append(f"- **预期降本**：{estimate_monthly_saving(total_cost, 0.12, 0.22)}。")
    lines.append("- **实施工作量**：M")
    lines.append("- **风险**：回答风格不一致，可能引入质量波动。")
    lines.append("- **回滚策略**：移除路由分支或将短模型改回主模型。")
    lines.append("")
    lines.append("## 3. 优先级决策矩阵")
    lines.append("")
    lines.append("| 候选 | 降本 | 工作量 | ROI = 降本/工作量 | 建议次序 |")
    lines.append("|---|---|---|---|---|")
    lines.append(f"| 1（RAG top_k 调优） | {estimate_monthly_saving(total_cost, 0.25, 0.35)} | S | 高 | **本周** |")
    lines.append(f"| 2（系统提示词瘦身） | {estimate_monthly_saving(total_cost, 0.10, 0.18)} | S | 高 | **本周** |")
    lines.append(f"| 3（短消息便宜模型） | {estimate_monthly_saving(total_cost, 0.12, 0.22)} | M | 中 | 下周 |")
    lines.append("")
    lines.append("> 优先做 ROI 高 + 风险低 + 有 eval 兜底的项。")
    lines.append("")
    lines.append("## 4. 实施清单（next 2 周）")
    lines.append("")
    lines.append("- [ ] **W1**：实施候选 1、2")
    lines.append("- [ ] **W1**：每个候选后执行 `pnpm eval:run -- --dataset bad --baseline <实施前实验名>`")
    lines.append("- [ ] **W2**：对比 LangSmith 7 天均值，验证降本与 P95 改善")
    lines.append("- [ ] **W2**：未达预期项回滚，并记录原因")
    lines.append("- [ ] **W2**：产出下一版 Playbook")
    lines.append("")
    lines.append("## 5. 已采纳的优化项历史")
    lines.append("")
    lines.append("| 候选项 | 实施日期 | 实施前成本 | 实施后成本 | 实际降本 | 备注 |")
    lines.append("|---|---|---|---|---|---|")
    lines.append("| _首次产出，本表暂空_ | | | | | |")
    lines.append("")
    lines.append("## 6. 不做清单（v1 暂不考虑）")
    lines.append("")
    lines.append("| 不做的事 | 原因 |")
    lines.append("|---|---|")
    lines.append("| 自研 LLM router | 工程量大，现阶段规则路由可覆盖 |")
    lines.append("| Prompt Cache（OpenAI 类） | SiliconFlow 当前不支持 prompt caching |")
    lines.append("| 量化模型本地部署 | 运维复杂度高，不符合当前目标 |")
    lines.append("| 多模型并发 ensemble | 成本上升明显，ROI 低 |")
    lines.append("")
    lines.append("## 7. 变更记录")
    lines.append("")
    lines.append("| 日期 | 版本 | 主要变化 |")
    lines.append("|---|---|---|")
    lines.append(
        f"| {datetime.now().strftime('%Y-%m-%d')} | {version} | 通过 LangSmith 数据自动生成基线、Top trace 与候选优化项 |"
    )
    lines.append("")
    return "\n".join(lines)


def replace_or_append_marked_block(
    text: str,
    start_marker: str,
    end_marker: str,
    block: str,
) -> str:
    marked = f"{start_marker}\n{block}\n{end_marker}"
    if start_marker in text and end_marker in text:
        before, tail = text.split(start_marker, 1)
        _, after = tail.split(end_marker, 1)
        return f"{before}{marked}{after}"
    if text.endswith("\n"):
        return f"{text}\n{marked}\n"
    return f"{text}\n\n{marked}\n"


def update_progress_markdown(progress_text: str, version: str, result: dict[str, Any]) -> str:
    summary = result["summary"]
    total_cost = float(summary["total_cost_usd"])
    w_cost = total_cost
    action_block = "\n".join(
        [
            f"## Phase 7 后续动作（来自 COST_OPTIMIZATION_PLAYBOOK {version}）",
            "",
            "| 优先级 | 优化项 | 预估降本 | 负责人 | 计划完成 |",
            "|---|---|---|---|---|",
            f"| P0 | 候选 1（RAG 检索结果数量调优） | {estimate_monthly_saving(w_cost, 0.25, 0.35)} | liurixing | {datetime.now().strftime('%Y-%m-%d')} |",
            f"| P0 | 候选 2（系统提示词瘦身） | {estimate_monthly_saving(w_cost, 0.10, 0.18)} | liurixing | {datetime.now().strftime('%Y-%m-%d')} |",
            f"| P1 | 候选 3（短消息走更便宜模型） | {estimate_monthly_saving(w_cost, 0.12, 0.22)} | liurixing | {datetime.now().strftime('%Y-%m-%d')} |",
            "",
            "> 完成后在本表标 ✅，并在 `COST_OPTIMIZATION_PLAYBOOK.md` §5 添加历史记录。",
        ]
    )
    return replace_or_append_marked_block(
        progress_text,
        "<!-- LANGSMITH_COST_REVIEW:PROGRESS:START -->",
        "<!-- LANGSMITH_COST_REVIEW:PROGRESS:END -->",
        action_block,
    )


def update_user_guide_markdown(user_guide_text: str) -> str:
    monthly_block = "\n".join(
        [
            "### 每月一次 — 成本反馈环（自动化版本）",
            "",
            "第 1 周完成后开始：",
            "",
            "1. 运行本 skill 拉取最近 7 天真实指标。",
            "2. 自动更新 `docs/monitor/COST_OPTIMIZATION_PLAYBOOK.md` 新版本。",
            "3. 选 ROI 最高 1~2 项实施，并执行 `pnpm eval:run -- --dataset bad --baseline <实施前实验名>`。",
            "4. 在 Playbook §5 更新“实施前后成本”历史记录。",
            "5. 回看 LangSmith 看板验证降本是否达标。",
        ]
    )
    return replace_or_append_marked_block(
        user_guide_text,
        "<!-- LANGSMITH_COST_REVIEW:USER_GUIDE:START -->",
        "<!-- LANGSMITH_COST_REVIEW:USER_GUIDE:END -->",
        monthly_block,
    )


def write_docs(repo_root: Path, result: dict[str, Any], version: str, dry_run: bool) -> None:
    playbook_path = repo_root / "docs/monitor/COST_OPTIMIZATION_PLAYBOOK.md"
    progress_path = repo_root / "docs/monitor/PROGRESS.md"
    user_guide_path = repo_root / "docs/monitor/USER_GUIDE.md"

    playbook_markdown = render_playbook_markdown(result, version)
    progress_text = progress_path.read_text(encoding="utf-8") if progress_path.exists() else ""
    user_guide_text = user_guide_path.read_text(encoding="utf-8") if user_guide_path.exists() else ""

    next_progress = update_progress_markdown(progress_text, version, result)
    next_user_guide = update_user_guide_markdown(user_guide_text)

    if dry_run:
        print(
            json.dumps(
                {
                    "mode": "dry_run",
                    "will_write": [
                        str(playbook_path.relative_to(repo_root)),
                        str(progress_path.relative_to(repo_root)),
                        str(user_guide_path.relative_to(repo_root)),
                    ],
                    "playbook_preview": playbook_markdown[:500],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    playbook_path.write_text(playbook_markdown, encoding="utf-8")
    progress_path.write_text(next_progress, encoding="utf-8")
    user_guide_path.write_text(next_user_guide, encoding="utf-8")


def main() -> None:
    args = parse_args()
    load_env()
    repo_root = Path(__file__).resolve().parents[4]
    api_key = os.getenv("LANGSMITH_API_KEY")
    if not api_key:
        raise RuntimeError("LANGSMITH_API_KEY 未配置，请检查项目根目录 .env")

    client = Client(api_key=api_key)
    start_time = datetime.now(timezone.utc) - timedelta(days=args.days)

    root_runs = list(
        client.list_runs(
            project_name=args.project,
            start_time=start_time,
            is_root=True,
        )
    )

    total = len(root_runs)
    errors = 0
    total_cost = 0.0
    latencies: list[float] = []
    rag_hit = 0
    rag_miss = 0
    scenario_counter: Counter[str] = Counter()

    rows: list[dict[str, Any]] = []
    for run in root_runs:
        if getattr(run, "error", None):
            errors += 1

        cost = float(getattr(run, "total_cost", 0) or 0)
        total_cost += cost

        start = getattr(run, "start_time", None)
        end = getattr(run, "end_time", None)
        latency = None
        if start and end:
            latency = (end - start).total_seconds()
            latencies.append(latency)

        tags = set(getattr(run, "tags", None) or [])
        if "rag:hit" in tags:
            rag_hit += 1
        if "rag:miss" in tags:
            rag_miss += 1

        scenario = classify_scenario(run)
        scenario_counter[scenario] += 1
        rows.append(
            {
                "id": str(getattr(run, "id", "")),
                "cost": cost,
                "latency": latency,
                "scenario": scenario,
                "brief": extract_brief(run),
            }
        )

    rows.sort(key=lambda item: item["cost"], reverse=True)
    top_rows = rows[: max(args.top, 1)]

    top_traces: list[TopTrace] = []
    for index, item in enumerate(top_rows, start=1):
        latency_value = item["latency"]
        top_traces.append(
            TopTrace(
                rank=index,
                trace_id_prefix=item["id"][:8],
                cost_usd=round(float(item["cost"]), 6),
                latency_s=round(float(latency_value), 2) if isinstance(latency_value, float) else None,
                scenario=item["scenario"],
                brief=item["brief"],
            )
        )

    if latencies:
        sorted_latencies = sorted(latencies)
        p95_idx = int(0.95 * (len(sorted_latencies) - 1))
        latency_p95 = round(sorted_latencies[p95_idx], 2)
    else:
        latency_p95 = 0.0

    llm_runs = list(
        client.list_runs(
            project_name=args.project,
            start_time=start_time,
            run_type="llm",
        )
    )
    model_tokens: defaultdict[str, int] = defaultdict(int)
    for run in llm_runs:
        model_tokens[get_model_name(run)] += get_tokens(run)

    all_model_tokens = sum(model_tokens.values())
    if all_model_tokens > 0:
        top_model, top_tokens = max(model_tokens.items(), key=lambda item: item[1])
        top_model_share_pct = round(top_tokens / all_model_tokens * 100, 2)
    else:
        top_model, top_model_share_pct = "unknown", 0.0

    rag_total = rag_hit + rag_miss
    result = {
        "project": args.project,
        "window_days": args.days,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "total_traces": total,
            "error_rate_pct": round(errors / total * 100, 2) if total else 0.0,
            "total_cost_usd": round(total_cost, 6),
            "rag_hit_rate_pct": round(rag_hit / rag_total * 100, 2) if rag_total else 0.0,
            "latency_p95_s": latency_p95,
            "top_model": top_model,
            "top_model_token_share_pct": top_model_share_pct,
        },
        "top_traces": [asdict(item) for item in top_traces],
        "scenario_distribution": dict(scenario_counter),
        "model_tokens": dict(model_tokens),
    }

    if args.write_docs:
        write_docs(repo_root, result, args.version, args.dry_run)
        print(
            json.dumps(
                {
                    "status": "ok",
                    "write_docs": True,
                    "dry_run": args.dry_run,
                    "version": args.version,
                    "summary": result["summary"],
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
