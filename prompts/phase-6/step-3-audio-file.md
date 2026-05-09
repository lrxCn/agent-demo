# Phase 6 - Step 3: 音频文件发送

## 上下文
语音通话已完成。现在添加 mp3 等音频文件发送功能。

## 任务

### 1. 在 useWebRTC 中添加文件发送
```typescript
// 使用 PeerJS 的 DataConnection 发送文件
async function sendAudioFile(file: File) {
  // 1. 通过 PeerJS data channel 发送文件
  // 2. 对方接收后可以播放
}
```

### 2. 在通话界面添加文件发送按钮
- 支持选择 mp3, wav, ogg 等音频文件
- 发送进度显示
- 接收方自动播放或手动播放

### 3. 接收方音频播放
- 接收到音频文件后，显示播放按钮
- 使用 HTML5 Audio API 播放

## 验证
通话中发送一个 mp3 文件，对方能接收并播放。

## 完成后
更新 PROJECT_STATUS.md 标记 6-3 为 ✅
