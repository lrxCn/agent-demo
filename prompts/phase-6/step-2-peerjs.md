# Phase 6 - Step 2: PeerJS 语音通话

## 上下文
信令服务已完成。现在集成 PeerJS 实现 P2P 语音通话。

## 任务

### 1. 安装 PeerJS
```bash
cd packages/frontend
pnpm add peerjs
```

### 2. 创建 `src/composables/useWebRTC.ts`
```typescript
import Peer from 'peerjs'

export function useWebRTC() {
  // 初始化 PeerJS（局域网模式，不用外部 STUN/TURN）
  // 使用用户 ID 作为 Peer ID
  
  // 发起呼叫
  async function call(targetUserId: string) {
    // 1. 获取本地麦克风流（仅音频）
    // navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    // 2. 通过 WebSocket 发送 rtc:call 信令
    // 3. 对方接听后，用 PeerJS 建立连接
    // 4. 交换音频流
  }
  
  // 接听来电
  async function answer() { /* ... */ }
  
  // 挂断
  function hangup() { /* ... */ }
  
  // 录音（使用 MediaRecorder API）
  function startRecording() { /* ... */ }
  function stopRecording(): Blob { /* ... */ }
  
  return { call, answer, hangup, startRecording, stopRecording }
}
```

### 3. 创建语音通话页面 `src/views/rtc/VoiceCallView.vue`
- 在线用户列表（可呼叫）
- 呼叫按钮
- 来电提示弹窗（接听/拒绝）
- 通话中界面（显示对方名称、通话时长、挂断按钮）
- 通话自动录音

### 4. 路由注册
`/rtc` → VoiceCallView

## 验证
打开两个浏览器 tab（用不同账号登录），一方呼叫另一方，能听到对方声音。

## 完成后
更新 PROJECT_STATUS.md 标记 6-2 为 ✅
