# Phase 7-4 / Step 2：工具白名单（按角色 RBAC）

## 上下文

Phase 7-4 第二步。**按用户角色过滤可用的 builtin 工具**——LLM 在 chat_node 拿到的 tools 列表里就**根本不包含**没权限的工具，这是 RBAC 进 Agent 的最干净路径。

执行前必读：

- `@docs/monitor/REQUIREMENTS.md` §8 决策 #9 顺序
- `@docs/monitor/1.PRD.md` §5.4.2（工具白名单验收清单）
- `@docs/monitor/3.ARCHITECTURE.md` §2 P5（tool ACL 决策点）
- `@packages/backend/src/agent/agent.service.ts`（要在 input 加 allowed_builtin_tools）
- `@packages/agent/src/graph/state.py`（要新增字段）
- `@packages/agent/src/graph/nodes.py` `chat_node`（要按白名单过滤）
- `@packages/agent/src/tools/registry.py`（要看 builtin 工具名清单）

前置条件：

- Phase 7-4 / Step 1 完成（顺序锁死）

## 任务

### 任务 0：先列出当前 builtin 工具名

```bash
cd packages/agent
uv run python -c "from src.tools.registry import registry; [print(t.name) for t in registry.get_tools(categories=['builtin'])]"
```

**记录输出的工具名清单**（如 `search_knowledge_base`、`search_my_calls`、`calculate`、`get_current_time` 等），下面任务 1 会用到。

### 任务 1：新建 `tool-acl.service.ts`

新建文件 `packages/backend/src/agent/tool-acl.service.ts`，**全文**：

```typescript
import { Injectable, Logger } from '@nestjs/common';

import { JwtUser } from '../auth/types/jwt-user.types';

/**
 * 工具白名单服务：把 user.permissionCodes 转成 Agent 可调用的 builtin 工具名列表。
 *
 * 权限编码约定：
 *   agent:tool:<tool_name>   → 单工具授权
 *   agent:tool:*             → 通配（推荐管理员角色用）
 *   *:*                      → 全局通配（已用于 admin）
 *
 * 不在权限内的工具会被从 LangGraph input.allowed_builtin_tools 中剔除，
 * chat_node 拼 tools 时按该列表过滤，LLM 拿到的就根本没有该工具。
 */
@Injectable()
export class ToolAclService {
  private readonly logger = new Logger(ToolAclService.name);

  /** 全部已知 builtin 工具名（与任务 0 输出对齐；新增工具时同步） */
  private static readonly ALL_BUILTIN_TOOLS = [
    'search_knowledge_base',
    'search_my_calls',
    'calculate',
    'get_current_time',
    // 任务 0 的实际清单中其他工具名补到这里
  ];

  resolveAllowed(user: JwtUser): string[] {
    const codes = new Set(user.permissionCodes ?? []);
    // 通配优先
    if (codes.has('*:*') || codes.has('*') || codes.has('agent:tool:*')) {
      return [...ToolAclService.ALL_BUILTIN_TOOLS];
    }
    const allowed = ToolAclService.ALL_BUILTIN_TOOLS.filter((t) =>
      codes.has(`agent:tool:${t}`),
    );
    return allowed;
  }

  /** 仅日志用：把"被拒绝的工具"列出，便于审计 */
  diff(user: JwtUser, allowed: string[]): string[] {
    return ToolAclService.ALL_BUILTIN_TOOLS.filter((t) => !allowed.includes(t));
  }
}
```

> ⚠️ 任务 0 实际工具名要补全到 `ALL_BUILTIN_TOOLS` 数组里。若漏写工具，会被 Service 误判为"不在白名单"。

### 任务 2：在 `agent.module.ts` 注册

修改 `@packages/backend/src/agent/agent.module.ts`：

```typescript
import { ToolAclService } from './tool-acl.service';

@Module({
  // ... imports
  controllers: [AgentController, FeedbackController],
  providers: [AgentService, SttService, FeedbackService, ToolAclService],
  // ...
})
```

### 任务 3：在 `agent.service.ts` 把 allowed 传给 LangGraph

修改 `@packages/backend/src/agent/agent.service.ts`：

#### 改动 3.1：注入

```typescript
import { ToolAclService } from './tool-acl.service';

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly userFrontendTools: UserFrontendToolsService,
    private readonly gateway: AppGateway,
    private readonly quota: QuotaService,
    private readonly toolAcl: ToolAclService,
  ) {}
```

#### 改动 3.2：在 `streamChat` 计算 allowed 并写入 input

找到 `streamChat` 中已有的 `const input = { ... }` 块，**改为**：

```typescript
    const allowedBuiltinTools = this.toolAcl.resolveAllowed(user);
    const deniedTools = this.toolAcl.diff(user, allowedBuiltinTools);
    if (deniedTools.length > 0) {
      this.logger.log(
        JSON.stringify({
          trace_id: TraceContext.getTraceId(),
          user_id: user.id,
          module: 'tool_acl',
          level: 'info',
          msg: 'builtin 工具按角色过滤',
          extra: {
            allowed: allowedBuiltinTools,
            denied: deniedTools,
          },
        }),
      );
    }

    const input = {
      messages: [{ role: 'user', content: dto.message }],
      mem0_user_id: user.id,
      thread_id: threadId,
      available_frontend_tools: mergedTools,
      user_role_ids: user.roleIds,
      app_trace_id: TraceContext.getTraceId(),
      // 监控体系 Phase 7-4 Step 2：按角色过滤的 builtin 工具白名单
      allowed_builtin_tools: allowedBuiltinTools,
    };
```

### 任务 4：在 `state.py` 新增字段

修改 `@packages/agent/src/graph/state.py`，在 AgentState 中**追加**：

```python
    # 监控体系 Phase 7-4 Step 2：后端按角色过滤后的 builtin 工具白名单
    # 缺失时按"全允许"兜底（向后兼容旧 invoke 调用）
    allowed_builtin_tools: NotRequired[list[str]]
```

完整文件如下：

```python
"""LangGraph Agent 状态定义"""
from typing import Annotated, NotRequired, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages


class AgentState(TypedDict):
    """Agent 状态"""

    messages: Annotated[list[BaseMessage], add_messages]
    mem0_user_id: str
    thread_id: str
    available_frontend_tools: list[str]
    user_role_ids: NotRequired[list[str]]
    retrieved_memories: NotRequired[list[str]]
    app_trace_id: NotRequired[str]
    # 监控体系 Phase 7-4 Step 2
    allowed_builtin_tools: NotRequired[list[str]]
```

### 任务 5：在 `chat_node` 按白名单过滤

修改 `@packages/agent/src/graph/nodes.py`，找到 `chat_node` 内部的：

```python
    # 内置工具始终加载
    builtin_tools = registry.get_tools(categories=['builtin'])
```

**改为**：

```python
    # 内置工具按"角色白名单"过滤（监控体系 Phase 7-4 Step 2）
    # state 缺该字段时按"全允许"兜底（CLI / 旧 invoke 不受影响）
    allowed_builtin = state.get('allowed_builtin_tools')
    if allowed_builtin is None:
        builtin_tools = registry.get_tools(categories=['builtin'])
    else:
        builtin_tools = registry.get_tools(
            categories=['builtin'],
            names=list(allowed_builtin),
        )
```

> 这里依赖 `registry.get_tools(names=...)` 已支持按名字过滤（看前端工具的写法 `registry.get_tools(categories=['frontend'], names=frontend_tool_names)`）。

### 任务 6：（可选）给低权限测试角色

为了验证步骤 4，可在数据库里手动建一个低权限测试角色：

```bash
sqlite3 packages/backend/data/agent-demo.db <<'EOF'
-- 仅授权 calculate（拒绝 search_knowledge_base）
INSERT OR IGNORE INTO permissions (id, code, name, group_name)
VALUES
  ('p-tool-calc', 'agent:tool:calculate', '工具:计算器', 'agent-tool');

INSERT OR IGNORE INTO roles (id, name, description)
VALUES ('r-low', 'low-tier-user', '低权限测试角色');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
VALUES ('r-low', 'p-tool-calc');

-- 把 admin 用户的一个分身绑这个角色（生产慎用！）
-- 或者新建一个普通用户：
INSERT OR IGNORE INTO users (id, username, password, nickname)
VALUES ('u-low', 'lowuser', '$2b$10$placeholder', '低权限测试');

INSERT OR IGNORE INTO user_roles (user_id, role_id)
VALUES ('u-low', 'r-low');
EOF
```

> 表结构以现有 entity 为准；列名可能略有不同（`roleId`/`role_id`），用 `.schema` 查看实际列。

或更简单：**只读 admin 路径**——admin 有通配权限，永远 hit `allowed = ALL_BUILTIN_TOOLS` 分支。该路径只能验证"通配走通"，不能验证"拒绝路径"。

## 验证

### 验证步骤 1：编译

```bash
cd packages/backend && pnpm build
cd ../agent && uv run python -c "from src.graph.state import AgentState; from src.graph.nodes import chat_node; print('OK')"
```

### 验证步骤 2：admin 路径（通配）

前端用 admin 登录，对话中调用某个 builtin 工具（如询问"现在几点"触发 `get_current_time`），LangSmith trace 上 `chat_node` 的 input.tools 应包含全部 builtin 工具。

后端日志应能**看不到** "builtin 工具按角色过滤"那行——因为 admin 走通配分支，没有 denied。

### 验证步骤 3：低权限路径（拒绝）

如果建了 `lowuser`，前端用 `lowuser` 登录（密码用 sql 重置后再登录），对话：

```
帮我搜知识库找一下学生张三的资料
```

后端日志应看到：

```
{"trace_id":"...","module":"tool_acl","msg":"builtin 工具按角色过滤","extra":{"allowed":["calculate"],"denied":["search_knowledge_base","search_my_calls","get_current_time"]}}
```

LangSmith trace 上 `chat_node` 的 `tools` 字段（在 invocation_params 里）应**只含 `calculate`**——LLM 根本没见到 `search_knowledge_base`，所以也不会去调它，会给用户一段"不支持"的回答。

### 验证步骤 4：白名单生效断言

LangSmith trace 详情 → `chat_node` span → 顶部"Inputs"中找 `state.allowed_builtin_tools` 字段，应为 `["calculate"]`（或低权限角色实际授权清单）。

### 故障排查

| 现象 | 原因 | 修复 |
|---|---|---|
| admin 也被过滤为空列表 | 通配权限码不匹配 | 检查 `*:*` 实际权限码（`WILDCARD_PERMISSION_CODE`），把它加入 `ToolAclService` 的通配判断 |
| 任务 0 输出有但 `ALL_BUILTIN_TOOLS` 漏写 | 工具名拼写不一致 | 用 grep `@tool` 在 `packages/agent/src/tools/` 找所有 builtin 工具装饰器，把 name 加进列表 |
| state.allowed_builtin_tools 字段在 trace 看不到 | `NotRequired` 没默认值 → 真没传 | 检查 agent.service.ts 是否真的写了 `allowed_builtin_tools: allowedBuiltinTools` |
| LLM 仍调用被拒绝的工具 | tools 列表确实包含 | 检查 chat_node 改动是否生效；`print(state.get('allowed_builtin_tools'))` debug |

## 完成后

### 更新 PROGRESS.md

```
| 7-4-2 | Guardrails Step-2：工具白名单 | ✅ | <今天日期> | tool-acl.service + agent.service 写 input.allowed_builtin_tools + state.py 新字段 + chat_node 按白名单过滤；admin 通配 + 低权限角色拒绝双路径验证通过 |
```

### git commit

```bash
git add packages/backend/src/agent/tool-acl.service.ts \
        packages/backend/src/agent/agent.module.ts \
        packages/backend/src/agent/agent.service.ts \
        packages/agent/src/graph/state.py \
        packages/agent/src/graph/nodes.py \
        docs/monitor/PROGRESS.md

git commit -m "$(cat <<'EOF'
feat(monitor): phase-7-4 step-2 工具白名单（RBAC → builtin tools）

- packages/backend/src/agent/tool-acl.service.ts:
  * resolveAllowed(user) → 按 permissionCodes 过滤 builtin 工具名
  * 通配支持 *:* / * / agent:tool:*
- agent.service.ts streamChat input 加 allowed_builtin_tools
- packages/agent/src/graph/state.py 新增 allowed_builtin_tools 字段 (NotRequired)
- nodes.py chat_node 按 state.allowed_builtin_tools 过滤 builtin
  * 缺失字段 = 兜底全允许（旧 CLI 不受影响）
- DoD: LangSmith trace 可见 state.allowed_builtin_tools；
  低权限角色调被拒绝工具时 LLM 拿不到该工具

ref: docs/monitor/PROGRESS.md 7-4-2
EOF
)"
```

### 下一步

完成本 step 才能进入 Phase 7-4 / Step 3（prompt-injection 关键词初筛）。
