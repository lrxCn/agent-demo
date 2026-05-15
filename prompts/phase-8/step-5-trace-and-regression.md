# Phase 8 / Step 5：LangSmith metadata/tags + 三组回归用例验证

## 上下文

Phase 8 收官步。在 `chat_node` 与 `kb_query_node` 内打 trace tag（`route:intent=*` / `route:kb_forced=*`），并跑完三组 LangSmith 端到端回归。完成后整个 Phase 8 ✅，可向需求方交付。

执行前必读：

- `@docs/AGENT_RAG_ROUTING_PLAN_B_REQUIREMENTS.md`（§4 F5 / §6 验收标准）
- `@docs/AGENT_RAG_ROUTING_PLAN_B_ARCHITECTURE.md`（§8 可观测性 / §10 三组验收用例）
- `@docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md`
- `@packages/agent/src/graph/nodes.py`（必读，已存在 `_add_tags_to_trace_root` 工具函数）
- `@packages/agent/src/graph/kb_query_node.py`（step-3 产物）
- `@docs/monitor/PROGRESS.md` Phase 7-2-2（参考 rag tag 写法）

前置条件：

- Phase 8 Step 1 ~ Step 4 已 ✅
- LangSmith 项目 `plan2code-agent` 可写（`LANGSMITH_API_KEY` 有效）
- 三端能起：`uv run langgraph dev --port 8123` + `pnpm --filter backend dev` + `pnpm --filter frontend dev`
- 已用 `admin / admin` 登录前端，并已在知识库上传过至少 1 篇含「陈可新」的文档（或自行替换被检索关键字）

---

## 任务

### 任务 1：在 `chat_node` 入口追加 `route:*` tag

修改 `@packages/agent/src/graph/nodes.py`。

找到 `chat_node` 入口已有的 `_add_tags_to_trace_root([f'rag:{rag_result}'])` **块**，在它**之后**追加（注意保持 try/except 风格）：

```python
    # === Phase 8 / Step 5：路由判定 tag ===
    if get_current_run_tree is not None:
        try:
            forced = state.get('forced_kb_results')
            kb_forced = isinstance(forced, list)  # 节点跑过即非 None
            # intent_route 由 step-2 路由函数定，但路由函数不写 state；
            # chat_node 这里反向推断：forced_kb_results 字段已被赋值即视为 kb_query 分支命中
            intent = 'kb_query' if kb_forced else 'chat_direct'
            _add_tags_to_trace_root([
                f'route:intent={intent}',
                f'route:kb_forced={"true" if kb_forced else "false"}',
            ])
        except Exception:  # noqa: BLE001
            # 监控埋点失败不影响主流程
            pass
```

> 为何不直接读 `state.get('intent_route')`？因为 LangGraph 条件边路由函数（intent_router）按设计**不写 state**。我们用 `forced_kb_results` 是否为 list 来反推路由分支，更可靠（kb_query_node 跑过 → 必定是 list；没跑过 → 字段缺失/None）。

### 任务 2：在 `kb_query_node` 内追加 `route:kb_forced=true` tag（增强 span 可读性）

修改 `@packages/agent/src/graph/kb_query_node.py`，import 区追加：

```python
try:
    from langsmith.run_helpers import get_current_run_tree
except ImportError:  # pragma: no cover
    get_current_run_tree = None  # type: ignore[assignment]
```

在 `kb_query_node` 函数返回前（即 `return {'forced_kb_results': results}` 之前）加：

```python
    if get_current_run_tree is not None:
        try:
            run = get_current_run_tree()
            if run is not None:
                run.add_tags(['route:kb_forced=true'])
        except Exception:  # noqa: BLE001
            pass
```

> 这里只对 **当前节点 span** 打 tag（不调 `_add_tags_to_trace_root`，避免与 chat_node 的根 trace tag 重复）。两处共同存在让看板既能从 trace 列表筛 chat 根 tag，又能从 span 详情页一眼看到 kb_query 节点。

### 任务 3：三组端到端验证（必须人工跑 LangSmith）

#### 用例 A：信息查询 → 强制检索

启动三端，前端发：
```
给我陈可新的信息
```

**LangSmith 期望**：
- trace 顶级 Tags：`route:intent=kb_query` + `route:kb_forced=true` + `rag:hit` 或 `rag:miss`
- span 树中能看到 `kb_query` 子 span，自带 `route:kb_forced=true`
- AI 最后一条消息基于 `forced_kb_results` 生成，**不直接调** `navigate_to_page`

#### 用例 B：明确导航 → 直接进 chat

前端发：
```
打开学生管理页面
```

**LangSmith 期望**：
- trace 顶级 Tags：`route:intent=chat_direct` + `route:kb_forced=false`
- **没有** `kb_query` 子 span
- AI 调用 `navigate_to_page`（前端弹 Modal.confirm，确认后跳转）

#### 用例 C：信息查询 + 导航复合

前端发：
```
陈可新是谁？并帮我打开学生页
```

**LangSmith 期望**：
- 第一轮 trace：`route:intent=kb_query` + `route:kb_forced=true`
- 后续轮次（工具回边后再次进 chat）依然是 `route:intent=kb_query`（多轮始终走过 kb_query 分支）
- AI 行为：**先**总结陈可新信息，**再**调用 `navigate_to_page`（顺序）

### 任务 4：回滚演练（必跑）

```bash
# 1. 关开关
sed -i.bak 's/^AGENT_RAG_ROUTER_ENABLED=.*/AGENT_RAG_ROUTER_ENABLED=false/' .env
# 2. 重启 Agent（前端/后端不动）
pkill -f "langgraph dev" || true
cd packages/agent && uv run langgraph dev --port 8123 &
sleep 6
# 3. 前端再发"给我陈可新的信息"
# 4. LangSmith trace 应该看不到 route:* tag
```

确认完毕后改回：
```bash
sed -i.bak 's/^AGENT_RAG_ROUTER_ENABLED=.*/AGENT_RAG_ROUTER_ENABLED=true/' .env
pkill -f "langgraph dev" || true
cd packages/agent && uv run langgraph dev --port 8123 &
```

### 任务 5：回归 Phase 7（无回退）

跑一遍 Phase 7 现有 eval：

```bash
pnpm eval:run -- --dataset rag
```

期望：
- 通过率不显著下降（与 step-4 之前相比）
- LangSmith Filter `tags has "guardrail:input:warn"` / `tags has "guardrail:output:pii"` 仍可命中
- `audit_logs` 表 `prompt_injection` / `pii_filtered` 事件仍正常落库

---

## 验证

### 验证清单（DoD）

- [ ] LangSmith Filter `tags has "route:intent=kb_query"` 可命中
- [ ] LangSmith Filter `tags has "route:intent=chat_direct"` 可命中
- [ ] LangSmith Filter `tags has "route:kb_forced=true"` 可命中
- [ ] 用例 A trace tag 完整且 AI 未先调 navigate
- [ ] 用例 B trace 不含 `route:kb_forced=true`，且确实调用了 navigate
- [ ] 用例 C 第一轮路由命中 kb_query，后续轮次 navigate 才被调用
- [ ] 关闭开关后 trace 不再出现 `route:*` tag
- [ ] `pnpm eval:run -- --dataset rag` 无显著退化
- [ ] `audit_logs` 表 4 类事件仍正常

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| trace 顶级看不到 `route:*` tag | `_add_tags_to_trace_root` 没把 tag merge 到根 run | 看 step-2 of phase-7-2 的实现细节，确认 `client.update_run(trace_id, tags=...)` 路径走通 |
| `route:intent=kb_query` 但 `route:kb_forced=false` | 路由命中但 `kb_query_node` 抛错被超时吞掉 | 看 Agent 日志的 `kb_query_node:` 行；确认 retriever 可用；确认 `user_role_ids` 非空 |
| 用例 C navigate 直接被调，没先答陈可新 | `chat_node` 的 forced_kb SystemMessage 未生效 | 检查 step-4 任务 2 的 SystemMessage 是否插在 messages 最前面 |
| Filter 输入 `tags has "..."` 没结果 | 是去 `Traces` 视图筛了 `Runs` 视图 | 必须在 Project → Traces 顶级筛 |
| 关闭开关后 `route:*` tag 仍出现 | Agent 进程未重启 / .env 未生效 | `pkill -f "langgraph dev"` 后重启；`echo $AGENT_RAG_ROUTER_ENABLED` |

---

## 完成后

### 更新 PROGRESS.md

把 `8-5` 那行改为 ✅，**并把 Phase 8 总进度改为 ✅ 已完成**。

「验收门槛 (DoD)」中的勾选项一并补全。

最后在「变更记录」追加：
```
| <今天日期> | 8-5 | LangSmith metadata/tags + 三组回归全绿；Phase 8 全部 ✅ |
```

### 更新 docs/PROJECT_STATUS.md

把 Phase 8 区段中 `8-1 ~ 8-5` 全部改 ✅，「Phase 8 整体」改为 ✅ 已完成。

### 更新 docs/ARCHITECTURE_FOR_AI.md（同步代码到文档）

在 "Agent 层详细说明 → 图的执行流程" 段，把：

```
START → chat_node → 判断是否有 tool_calls → ...
```

改为：
```
START → memory_search → intent_router →
  ├─ kb_query_node → chat
  └─ chat
chat → memory_save → 判断是否有 tool_calls → ...
```

并在文末「环境变量」段追加 `AGENT_RAG_ROUTER_ENABLED` 一行说明。

### git commit

```bash
git add \
  packages/agent/src/graph/nodes.py \
  packages/agent/src/graph/kb_query_node.py \
  docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md \
  docs/PROJECT_STATUS.md \
  docs/ARCHITECTURE_FOR_AI.md

git commit -m "$(cat <<'EOF'
feat(agent): phase-8 step-5 trace tag 注入 + 三组端到端回归通过

- nodes.py: chat_node 入口追加 route:intent / route:kb_forced 根 tag
- kb_query_node.py: span 自带 route:kb_forced=true tag
- 三组用例 LangSmith 端到端验证通过：
  * 信息查询 → 强制检索（不调 navigate）
  * 明确导航 → 直接 chat（调用 navigate）
  * 复合请求 → 先检索再导航
- 回滚演练通过：AGENT_RAG_ROUTER_ENABLED=false 后 route:* tag 消失
- pnpm eval:run -- --dataset rag 无显著退化
- 同步更新 PROJECT_STATUS.md / ARCHITECTURE_FOR_AI.md

ref: docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md 8-5
EOF
)"

git tag phase-8-done
```

🎉 **Phase 8 全部完成！** Agent RAG 路由方案 B 已上线，信息查询稳定走 RAG。
