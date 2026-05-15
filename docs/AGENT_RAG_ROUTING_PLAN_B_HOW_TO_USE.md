# 如何配合 Cursor 完成 Phase 8（Agent RAG 路由方案 B）

> 本文是 Phase 8 的「使用说明书」。把它当成 `HOW_TO_USE_WITH_CURSOR.md` 的 **Phase 8 专版**。
> 阅读完本文，你就知道怎么把 5 个 step 串起来，跨多个 Cursor 窗口接力执行，并随时回滚。

---

## 0. 一图看清四份文档分工

```
docs/
├── AGENT_RAG_ROUTING_PLAN_B_REQUIREMENTS.md   ← 元需求 + 验收（不变量，长期参考）
├── AGENT_RAG_ROUTING_PLAN_B_ARCHITECTURE.md   ← 系统侧改造地图（图、状态、开关）
├── AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md       ← 接力棒（每完成一步必须更新）
└── AGENT_RAG_ROUTING_PLAN_B_HOW_TO_USE.md     ← 本文档（使用流程）

prompts/phase-8/
├── step-1-state-and-flag.md      ← 基础设施（state 字段 + 开关）
├── step-2-intent-router.md       ← 意图路由（规则法 + 单测）
├── step-3-kb-query-node.md       ← 强制检索节点
├── step-4-builder-and-chat.md    ← 图层接线 + chat_node 消费
└── step-5-trace-and-regression.md← LangSmith tag + 三组回归
```

> **核心原则**：5 个 step 严格串行，每一步独立 commit，可随时回滚。新窗口按 PROGRESS 接力。

---

## 1. 准备工作（一次性）

### 1.1 服务起好

```bash
# 1) 数据服务（OrbStack 容器）
docker ps | grep -E "redis|qdrant"
# 没起就：
docker start redis qdrant

# 2) Python 依赖
cd packages/agent
uv sync
```

### 1.2 LangSmith / .env 检查

```bash
grep -E "LANGSMITH_API_KEY|LANGCHAIN_TRACING_V2|LANGCHAIN_PROJECT" .env
# 应该看到：
# LANGSMITH_API_KEY=lsv2_pt_***
# LANGCHAIN_TRACING_V2=true
# LANGCHAIN_PROJECT=plan2code-agent
```

### 1.3 知识库准备（用于 8-3 / 8-5 验收）

如果知识库为空，先在前端 Knowledge 管理页上传一篇含 **「陈可新」** 字样的 `.txt` / `.pdf`（或自行替换三组用例的关键字）。

---

## 2. 标准接力流程（每个 step 重复）

### 2.1 开新 Cursor 会话（Composer）

新会话的**第一句话只贴一个关键词**即可，以下任意一条都行：

```
Phase 8 继续
```

```
RAG 路由方案 B 下一步
```

```
@docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md 我做到第几步了？
```

> 因为 `.cursor/rules/06-rag-routing-context.mdc` 已配置「会话开场仪式」，Cursor 会**自动**：
> 1. 读取 REQUIREMENTS / ARCHITECTURE / PROGRESS 三份文档
> 2. 报告当前进度并指出下一个 ⬜ step（例如 `8-2`）
> 3. 等待你确认或粘贴 prompt 文件

**你不需要**再手动列出三份文档路径——这是规则的活，不是你的活。

### 2.2 执行该 step

Cursor 报告"下一步是 8-2"后，你只需要回复：

```
@prompts/phase-8/step-2-intent-router.md 严格按任务段执行，跑完验证段把输出贴我
```

或者更省事的版本（让 rule 自己挑下一个 ⬜ step）：

```
开始下一步
```

让 Cursor 跑验证。**不要**让它顺手做下一步。

### 2.3 更新 PROGRESS（接力棒交接）

```
验证已通过。请按 @prompts/phase-8/step-2-intent-router.md 的「完成后 → 更新 PROGRESS.md」
更新 @docs/AGENT_RAG_ROUTING_PLAN_B_PROGRESS.md，并给出 git commit 命令（不要自己 commit）。
```

你拿到 commit 命令后**自己**在终端执行（这是 .cursorrules 里硬性规定，避免 Cursor 误改 git 状态）。

### 2.4 关闭当前会话，开新会话做下一步

**不要**在同一个会话里连续做 step-2 → step-3。理由：
- 上下文窗口被 step-2 的代码细节污染，模型容易把 step-3 当成 step-2 的延续
- 一旦 step-2 出 bug，新窗口能干净复用 PROGRESS 的描述快速定位

---

## 3. 五步串行的预估工时

| Step | 工时 | 难度 | 依赖 |
|------|------|------|------|
| 8-1 | 30 min | ⭐ | 无 |
| 8-2 | 1 ~ 1.5 h | ⭐⭐（关键词词表需要琢磨） | 8-1 |
| 8-3 | 1 h | ⭐⭐（含 mock 单测 + 超时用例） | 8-1 |
| 8-4 | 1 ~ 2 h | ⭐⭐⭐（图接线最易出错） | 8-2、8-3 |
| 8-5 | 2 ~ 3 h | ⭐⭐（需手动跑 LangSmith 验收） | 8-4 |

总计 ≈ 1.5 ~ 2 天，含调试。

---

## 4. 回滚策略（线上事故时一定要会）

任何时候发现新图行为异常，按这个顺序回滚：

### 4.1 一键关开关（推荐）

```bash
# 1. 修改 .env
sed -i.bak 's/^AGENT_RAG_ROUTER_ENABLED=.*/AGENT_RAG_ROUTER_ENABLED=false/' .env

# 2. 重启 Agent（前端/后端不动，零感知）
pkill -f "langgraph dev" || true
cd packages/agent && nohup uv run langgraph dev --port 8123 >/tmp/agent.log 2>&1 &

# 3. 验证：去 LangSmith 发一条新 trace，确认 route:* tag 已消失
```

### 4.2 完整 git 回滚

```bash
git tag rollback-phase-8 HEAD       # 标记当前位置便于回头看 diff
git reset --hard phase-7-done        # 或 git reset --hard <你 step-1 之前的 commit>
pnpm install
cd packages/agent && uv sync
```

---

## 5. 常见问题

### Q1：Cursor 打开 prompt 文件后行为很奇怪，做了 prompt 之外的事

A：**关掉会话重开**，把指令改成：

```
请只读 @prompts/phase-8/step-3-kb-query-node.md 的「任务 1」和「任务 2」段，
其他段先不要看。完成这两个任务后停下来，把代码 diff 贴给我审核。
```

把 step 拆得更细。

### Q2：单元测试卡在 `test_timeout_guard_falls_back_to_empty` 10 秒不动

A：这是预期。`node_timeout_guard` 装饰器超时后线程仍在 sleep（不打断），但测试本身已正确返回。等 10s 即可。

### Q3：`AGENT_RAG_ROUTER_ENABLED=true` 但 trace 看不到 `route:intent=kb_query`

A：检查顺序：
1. Agent 重启了吗（builder.py 在 import 阶段读环境变量）
2. 你的提问是否命中 `INFO_QUERY_KEYWORDS`（可单独跑 step-2 验证步骤 3）
3. LangSmith 看的是 **Project → Traces** 顶级，不是 Runs 子节点

### Q4：方案 B 启用后 LLM 响应变慢

A：每次信息查询多了一次 retriever（含 embedding + Qdrant + Rerank）调用。如果不可接受，可以：
- 把 `KB_QUERY_LIMIT` 从 5 改小到 3（kb_query_node.py）
- 或暂时 `AGENT_RAG_ROUTER_ENABLED=false` 退化，调研后再开
- 或缩短 `KB_QUERY_TIMEOUT_SECONDS` 让超时更早降级

### Q5：开两个窗口同时改不同 step 行不行

A：**不建议**。8-1/8-2 间无写冲突可以并行，但 8-4 同时动 `builder.py` 和 `nodes.py`，与其他 step 必然冲突。串行省心。

### Q6：我已经做完 Phase 7 了，能跳着先做 Phase 8 再回头补 Phase 7 没做完的步骤吗

A：可以。Phase 8 不依赖 Phase 7 的全部内容，只复用：
- `state.app_trace_id` 字段（Phase 7-1）
- `_add_tags_to_trace_root()` 工具函数（Phase 7-2-2）
- `state.allowed_builtin_tools` 字段（Phase 7-4-2，**没有也兼容**）

Phase 7-3（eval）/ 7-4-5（audit_logs）/ 7-5（cost playbook）可后做。

---

## 6. 完成后的标记

整个 Phase 8 完成（5 个 step 全部 ✅）后：

```bash
git tag phase-8-done
# 可选：推到远端
# git push origin phase-8-done
```

并在 `docs/PROJECT_STATUS.md` 把 Phase 8 整体改为 `✅ 已完成`。

---

## 7. 最小成本验收（不跑前端也能确认大致 OK）

如果懒得起前后端，只想最小成本验证 Agent 改造对：

```bash
cd packages/agent

# 1) 单测全绿
uv run pytest tests/graph/test_intent_router.py tests/graph/test_kb_query_node.py -v

# 2) 直接 invoke 一次（替换 role_id）
uv run python -c "
from langchain_core.messages import HumanMessage
from src.graph.builder import graph
state = {
    'messages': [HumanMessage(content='给我陈可新的信息')],
    'mem0_user_id': 'cli_user',
    'thread_id': 'cli_p8',
    'available_frontend_tools': [],
    'user_role_ids': ['<你的 role_id>'],
    'app_trace_id': '00000000000000000000000000000001',
}
out = graph.invoke(state)
assert 'forced_kb_results' in out, '强制检索未执行！'
print('OK forced_kb_results count =', len(out['forced_kb_results']))
"
```

3) 去 LangSmith 看上一条 trace，应该有 `route:intent=kb_query` tag。

满足以上 3 点即视为 Phase 8 实施成功。
