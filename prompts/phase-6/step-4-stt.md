# Phase 6 - Step 4: 语音转文字 (SiliconFlow Whisper)

## 上下文
通话和音频文件发送已完成。现在实现通话录音的语音转文字。

## 任务

### 1. 在 NestJS 创建 STT 服务
`src/agent/stt.service.ts`：
```typescript
// 调用 SiliconFlow Whisper API
// POST https://api.siliconflow.cn/v1/audio/transcriptions
// 发送录音文件，获取文字转写结果

async transcribe(audioBuffer: Buffer, filename: string): Promise<string> {
  const formData = new FormData()
  formData.append('file', new Blob([audioBuffer]), filename)
  formData.append('model', 'FunAudioLLM/SenseVoiceSmall')
  
  const response = await axios.post(
    `${process.env.OPENAI_BASE_URL}/audio/transcriptions`,
    formData,
    { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
  )
  return response.data.text
}
```

### 2. 创建通话录音上传接口
`POST /api/v1/agent/transcribe`
- 接收前端上传的录音文件（WebM/WAV 格式）
- 调用 STT 服务转文字
- 返回转写文本

### 3. 前端：通话结束后自动上传录音
在 useWebRTC 的 hangup 中：
- 停止录音 → 获取录音 Blob
- 上传到后端 → 获取转写文本
- 将转写文本存入 RAG（下一步）

## 验证
通话结束后，检查后端日志中能看到转写的文字内容。

## 完成后
更新 PROJECT_STATUS.md 标记 6-4 为 ✅
