# Phase 2 - Step 7: WebSocket Gateway

## 上下文
SSE 代理已完成。创建 WebSocket 网关，用于前端工具调用回传和 WebRTC 信令。
请参阅 @docs/API_CONTRACTS.md 的 WebSocket 事件定义。

## 任务

### 1. 创建 WebSocket Gateway
`src/common/gateways/app.gateway.ts`：
```typescript
@WebSocketGateway({ namespace: '/ws', cors: true })
export class AppGateway implements OnGatewayConnection, OnGatewayDisconnect {
  // JWT 验证：从 handshake query 或 auth header 中提取 token
  // 维护在线用户映射：Map<userId, Socket>
  
  handleConnection(client: Socket) {
    // 验证 JWT token
    // 注册到在线用户映射
  }
  
  handleDisconnect(client: Socket) {
    // 从在线用户映射中移除
  }
  
  // 前端工具调用相关
  @SubscribeMessage('tools:update')
  handleToolsUpdate(client, data) {
    // 缓存当前用户的可用工具列表
  }
  
  @SubscribeMessage('tool:result')
  handleToolResult(client, data) {
    // 接收前端工具执行结果，转发给 Agent
  }
  
  // WebRTC 信令（Phase 6 实现，先预留）
  @SubscribeMessage('rtc:call')
  handleRtcCall(client, data) { /* Phase 6 */ }
  
  @SubscribeMessage('rtc:answer')
  handleRtcAnswer(client, data) { /* Phase 6 */ }
  
  @SubscribeMessage('rtc:signal')
  handleRtcSignal(client, data) { /* Phase 6 */ }
  
  @SubscribeMessage('rtc:hangup')
  handleRtcHangup(client, data) { /* Phase 6 */ }
}
```

### 2. 注册到 AppModule

### 3. 用户可用工具缓存
使用内存 Map 缓存每个用户当前页面的可用工具列表。
Agent 代理层调用时从这里取。

## 验证
```bash
# 用 wscat 测试（需要 npm install -g wscat）
wscat -c "ws://localhost:3000/ws?token=<JWT_TOKEN>"
# 连接成功即可
```

## 完成后
更新 PROJECT_STATUS.md 标记 2-7 为 ✅，整个 Phase 2 完成。

```bash
git add .
git commit -m "feat: Phase 2 完成 - NestJS 后端（认证/权限/CRUD/Agent代理/WebSocket）"
```
