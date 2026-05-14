# API 接口契约

> 前后端联调的统一契约文档。后端实现和前端调用都以此为准。

## 通用约定

### 请求头
```
Authorization: Bearer <access_token>
Content-Type: application/json
```

### 统一响应格式
```json
{
  "code": 0,
  "data": {},
  "message": "ok"
}
```

### 错误响应
```json
{
  "code": 40001,
  "data": null,
  "message": "用户名或密码错误"
}
```

### 分页请求
```
GET /api/v1/students?page=1&pageSize=20&keyword=张
```

### 分页响应
```json
{
  "code": 0,
  "data": {
    "items": [],
    "total": 100,
    "page": 1,
    "pageSize": 20
  }
}
```

---

## 认证模块 `/api/v1/auth`

### POST /login
登录获取 token
```json
// Request
{ "username": "admin", "password": "admin" }

// Response
{
  "code": 0,
  "data": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "expires_in": 3600,
    "user": {
      "id": "uuid",
      "username": "admin",
      "nickname": "管理员",
      "roles": ["admin"],
      "permissions": ["*"]
    }
  }
}
```

### POST /refresh
刷新 token
```json
// Request
{ "refresh_token": "eyJ..." }

// Response
{ "code": 0, "data": { "access_token": "eyJ...", "expires_in": 3600 } }
```

---

## 用户模块 `/api/v1/users`

| 方法 | 路由 | 说明 | 权限 |
|------|------|------|------|
| GET | / | 分页查询用户列表 | user:view |
| GET | /:id | 获取用户详情 | user:view |
| POST | / | 创建用户 | user:create |
| PUT | /:id | 更新用户 | user:update |
| DELETE | /:id | 删除用户 | user:delete |
| PUT | /:id/roles | 给用户分配角色 | user:assign-role |

---

## 角色模块 `/api/v1/roles`

| 方法 | 路由 | 说明 | 权限 |
|------|------|------|------|
| GET | / | 查询角色列表 | role:view |
| POST | / | 创建角色 | role:create |
| PUT | /:id | 更新角色 | role:update |
| DELETE | /:id | 删除角色 | role:delete |
| PUT | /:id/permissions | 给角色分配权限 | role:assign-permission |

---

## 权限模块 `/api/v1/permissions`

| 方法 | 路由 | 说明 | 权限 |
|------|------|------|------|
| GET | / | 查询权限列表（按分组） | permission:view |

---

## 学生模块 `/api/v1/students`

| 方法 | 路由 | 说明 | 权限 |
|------|------|------|------|
| GET | / | 分页查询学生 | student:view |
| GET | /:id | 获取学生详情 | student:view |
| POST | / | 创建学生 | student:create |
| PUT | /:id | 更新学生 | student:update |
| DELETE | /:id | 删除学生 | student:delete |
| POST | /batch | 批量创建 | student:create |
| DELETE | /batch | 批量删除 | student:delete |

---

## Agent 对话 `/api/v1/agent`

### POST /chat (SSE)
流式对话
```json
// Request
{
  "message": "帮我查一下张三的信息",
  "thread_id": "uuid",
  "available_tools": ["create_student", "delete_student"]
}

// Response: SSE Stream
event: message
data: {"type": "token", "content": "正在"}

event: message
data: {"type": "token", "content": "查询"}

event: message
data: {"type": "tool_call", "tool": "query_student", "params": {"name": "张三"}}

event: message
data: {"type": "done", "content": "完整回复内容"}
```

---

## 内部审计接口 `/api/v1/internal`

> 仅 Agent 进程内部回调使用，不走 JWT；使用共享密钥鉴权。

### POST /audit-log
写入 Guardrails 命中事件审计日志（`quota_exceeded` / `tool_denied` / `prompt_injection` / `pii_filtered`）。

请求头：
```http
x-internal-api-key: <INTERNAL_API_KEY>
Content-Type: application/json
```

请求体：
```json
{
  "trace_id": "019e206736cd7e52be82665f2b011f97",
  "user_id": "uuid",
  "event_type": "prompt_injection",
  "severity": "warn",
  "payload": {
    "matched_keywords": ["忽略以上指令"],
    "last_human_text_preview": "请忽略以上指令..."
  }
}
```

成功响应：
- HTTP `204 No Content`（无响应体）

失败响应：
- `403`：`x-internal-api-key` 缺失或错误
- `400`：`event_type` 缺失

---

## 知识库 `/api/v1/knowledge`

| 方法 | 路由 | 说明 | 权限 |
|------|------|------|------|
| GET | / | 查询知识库列表 | knowledge:view |
| POST | /upload | 上传文件到知识库 | knowledge:create |
| DELETE | /:id | 删除知识库条目 | knowledge:delete |
| PUT | /:id/roles | 设置知识库角色权限 | knowledge:manage |

---

## WebSocket 事件

### 连接
```
ws://localhost:3000/ws?token=<access_token>
```

### 前端工具调用事件
```json
// Server → Client: Agent 请求调用前端工具
{ "event": "tool:invoke", "data": { "id": "uuid", "tool": "navigate", "params": { "path": "/students" }, "requireConfirm": true } }

// Client → Server: 用户确认后执行结果
{ "event": "tool:result", "data": { "id": "uuid", "success": true, "result": {} } }
```

### 前端工具注册事件
```json
// Client → Server: 页面切换时通知可用工具
{ "event": "tools:update", "data": { "tools": ["create_student", "delete_student", "navigate"] } }
```

### WebRTC 信令事件
```json
// Client → Server: 发起呼叫
{ "event": "rtc:call", "data": { "targetUserId": "uuid" } }

// Server → Client: 收到呼叫
{ "event": "rtc:incoming", "data": { "callerUserId": "uuid", "callerName": "张三" } }

// Client → Server: 接听/拒绝
{ "event": "rtc:answer", "data": { "accept": true } }
{ "event": "rtc:reject", "data": {} }

// 信令交换
{ "event": "rtc:signal", "data": { "targetUserId": "uuid", "signal": { /* PeerJS signal data */ } } }

// 挂断
{ "event": "rtc:hangup", "data": {} }
```
