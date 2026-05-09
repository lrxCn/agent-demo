# Phase 6 - Step 1: WebSocket 信令服务

## 上下文
RAG 已完成（Phase 5）。现在实现 WebRTC 语音通话。
请参阅 @docs/API_CONTRACTS.md 的 WebSocket 信令事件定义。

## 任务

### 1. 完善 NestJS WebSocket Gateway 的 RTC 相关事件
在 Phase 2 Step 7 创建的 `app.gateway.ts` 中，完善之前预留的 RTC 事件处理：

```typescript
// rtc:call - 发起呼叫
// 查找目标用户是否在线 → 在线则转发 rtc:incoming 事件

// rtc:answer - 接听
// 通知呼叫方对方已接听

// rtc:reject - 拒绝
// 通知呼叫方对方已拒绝

// rtc:signal - PeerJS 信令交换
// 转发给目标用户

// rtc:hangup - 挂断
// 通知对方已挂断
```

### 2. 在线用户管理
- 维护在线用户列表
- 提供接口查询在线用户：`@SubscribeMessage('rtc:online-users')`
- 用户断开连接时自动清理

## 验证
用 2 个浏览器 tab 连接 WebSocket，验证信令事件的转发。

## 完成后
更新 PROJECT_STATUS.md 标记 6-1 为 ✅
