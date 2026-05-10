import { Message } from '@arco-design/web-vue'
import Peer, { type DataConnection, type MediaConnection } from 'peerjs'
import { computed, onUnmounted, ref, shallowRef } from 'vue'
import { transcribeAudio } from '../api/modules/agent'
import { useAuthStore } from '../stores/auth'
import { getWebSocketClient } from './useWebSocket'

interface IncomingCallInfo {
  callerUserId: string
}

interface AudioFileMeta {
  id: string
  name: string
  mimeType: string
  size: number
}

interface ReceivedAudioFile extends AudioFileMeta {
  blob: Blob
  objectUrl: string
}

interface IncomingTransferSession {
  meta: AudioFileMeta
  chunks: ArrayBuffer[]
  receivedBytes: number
}

interface AudioMetaMessage {
  type: 'audio-meta'
  payload: AudioFileMeta
}

interface AudioChunkMessage {
  type: 'audio-chunk'
  payload: {
    id: string
    chunk: ArrayBuffer
  }
}

interface AudioEndMessage {
  type: 'audio-end'
  payload: {
    id: string
  }
}

type AudioTransferMessage = AudioMetaMessage | AudioChunkMessage | AudioEndMessage

function buildPeerConfig() {
  const host = (import.meta.env.VITE_PEER_HOST as string | undefined) || window.location.hostname
  const port = Number(import.meta.env.VITE_PEER_PORT ?? 9000)
  const path = (import.meta.env.VITE_PEER_PATH as string | undefined) || '/peerjs'
  return {
    host,
    port,
    path,
    secure: window.location.protocol === 'https:',
    config: { iceServers: [] },
  }
}

export function useWebRTC() {
  const auth = useAuthStore()

  const peer = shallowRef<Peer | null>(null)
  const connection = shallowRef<MediaConnection | null>(null)
  const dataConnection = shallowRef<DataConnection | null>(null)
  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)
  const incomingCall = ref<IncomingCallInfo | null>(null)
  const pendingCallerId = ref<string | null>(null)
  const callingUserId = ref<string | null>(null)
  const activeUserId = ref<string | null>(null)
  const startedAt = ref<number | null>(null)
  const recorder = shallowRef<MediaRecorder | null>(null)
  const recordChunks = ref<Blob[]>([])
  const recordedBlob = ref<Blob | null>(null)
  const isTranscribing = ref(false)
  const transcribedText = ref('')
  const onlineUserIds = ref<string[]>([])
  const isSendingAudioFile = ref(false)
  const sendingProgress = ref(0)
  const sendingFileName = ref('')
  const receivingProgress = ref(0)
  const receivedAudioFiles = ref<ReceivedAudioFile[]>([])
  const incomingTransferSessions = new Map<string, IncomingTransferSession>()

  const callDurationSec = computed(() =>
    startedAt.value ? Math.floor((Date.now() - startedAt.value) / 1000) : 0,
  )

  function ensureSocket() {
    const socket = getWebSocketClient()
    if (!socket || !socket.connected) {
      throw new Error('WebSocket 未连接，请返回首页稍后重试')
    }
    return socket
  }

  function ensurePeer(): Peer {
    if (peer.value) {
      return peer.value
    }
    const userId = auth.user?.id
    if (!userId) {
      throw new Error('用户未登录')
    }
    const p = new Peer(userId, buildPeerConfig())
    p.on('error', (err) => {
      Message.error(`Peer 连接异常: ${err.message}`)
    })
    p.on('call', async (mediaConn) => {
      // 仅允许当前正在确认的来电建立连接，防止串线。
      if (pendingCallerId.value && mediaConn.peer !== pendingCallerId.value) {
        mediaConn.close()
        return
      }
      try {
        const stream = await getLocalAudioStream()
        bindConnection(mediaConn)
        mediaConn.answer(stream)
        activeUserId.value = mediaConn.peer
        pendingCallerId.value = null
        incomingCall.value = null
        startRecording()
      } catch (err) {
        const msg = err instanceof Error ? err.message : '接听失败'
        Message.error(msg)
      }
    })
    p.on('connection', (conn) => {
      bindDataConnection(conn)
    })
    peer.value = p
    return p
  }

  async function getLocalAudioStream(): Promise<MediaStream> {
    if (localStream.value) {
      return localStream.value
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    localStream.value = stream
    return stream
  }

  function bindConnection(mediaConn: MediaConnection) {
    if (connection.value) {
      connection.value.close()
    }
    connection.value = mediaConn
    mediaConn.on('stream', (stream) => {
      remoteStream.value = stream
      if (!startedAt.value) {
        startedAt.value = Date.now()
      }
    })
    mediaConn.on('close', () => {
      clearCallState(false)
    })
    mediaConn.on('error', () => {
      clearCallState(false)
    })
  }

  function bindDataConnection(conn: DataConnection) {
    if (dataConnection.value && dataConnection.value !== conn) {
      dataConnection.value.close()
    }
    dataConnection.value = conn
    conn.on('data', (data) => {
      handleDataMessage(data)
    })
    conn.on('close', () => {
      if (dataConnection.value === conn) {
        dataConnection.value = null
      }
      receivingProgress.value = 0
      incomingTransferSessions.clear()
    })
    conn.on('error', () => {
      Message.error('音频文件通道异常')
    })
  }

  function ensureDataConnection(targetUserId: string): DataConnection {
    const p = ensurePeer()
    const current = dataConnection.value
    if (current && current.peer === targetUserId && current.open) {
      return current
    }
    const conn = p.connect(targetUserId, { reliable: true })
    bindDataConnection(conn)
    return conn
  }

  function isAudioTransferMessage(value: unknown): value is AudioTransferMessage {
    if (!value || typeof value !== 'object' || !('type' in value)) {
      return false
    }
    const msg = value as { type?: string }
    return msg.type === 'audio-meta' || msg.type === 'audio-chunk' || msg.type === 'audio-end'
  }

  function handleDataMessage(data: unknown) {
    if (!isAudioTransferMessage(data)) {
      return
    }
    if (data.type === 'audio-meta') {
      incomingTransferSessions.set(data.payload.id, {
        meta: data.payload,
        chunks: [],
        receivedBytes: 0,
      })
      receivingProgress.value = 0
      Message.info(`正在接收音频文件：${data.payload.name}`)
      return
    }
    if (data.type === 'audio-chunk') {
      const session = incomingTransferSessions.get(data.payload.id)
      if (!session) {
        return
      }
      const chunk = data.payload.chunk
      session.chunks.push(chunk)
      session.receivedBytes += chunk.byteLength
      const total = session.meta.size || 1
      receivingProgress.value = Math.min(100, Math.floor((session.receivedBytes / total) * 100))
      return
    }
    const session = incomingTransferSessions.get(data.payload.id)
    if (!session) {
      return
    }
    const blob = new Blob(session.chunks, { type: session.meta.mimeType || 'audio/mpeg' })
    const objectUrl = URL.createObjectURL(blob)
    receivedAudioFiles.value.unshift({
      ...session.meta,
      blob,
      objectUrl,
    })
    receivingProgress.value = 100
    incomingTransferSessions.delete(data.payload.id)
    Message.success(`音频文件接收完成：${session.meta.name}`)
  }

  function bindSignalingEvents() {
    const socket = ensureSocket()
    socket.off('rtc:incoming')
    socket.off('rtc:answered')
    socket.off('rtc:rejected')
    socket.off('rtc:hangup')
    socket.on('rtc:incoming', (payload: { callerUserId?: string }) => {
      if (!payload?.callerUserId) {
        return
      }
      incomingCall.value = { callerUserId: payload.callerUserId }
    })
    socket.on('rtc:answered', ({ userId }: { userId?: string }) => {
      if (!callingUserId.value || !userId || userId !== callingUserId.value) {
        return
      }
      void establishOutgoingCall(userId)
    })
    socket.on('rtc:rejected', ({ userId }: { userId?: string }) => {
      if (callingUserId.value && userId === callingUserId.value) {
        Message.info('对方已拒绝来电')
        callingUserId.value = null
      }
    })
    socket.on('rtc:hangup', ({ userId }: { userId?: string }) => {
      if (activeUserId.value && userId === activeUserId.value) {
        void finalizeRecordingAndTranscribe().finally(() => {
          clearCallState(false)
        })
      }
    })
  }

  async function refreshOnlineUsers() {
    const socket = ensureSocket()
    const users = await new Promise<string[]>((resolve) => {
      socket.emit('rtc:online-users', (resp: { ok?: boolean; users?: string[] }) => {
        if (resp?.ok && Array.isArray(resp.users)) {
          resolve(resp.users)
          return
        }
        resolve([])
      })
    })
    onlineUserIds.value = users.filter((id) => id && id !== auth.user?.id)
  }

  async function call(targetUserId: string) {
    const socket = ensureSocket()
    ensurePeer()
    await getLocalAudioStream()
    socket.emit('rtc:call', { targetUserId }, (resp: { ok?: boolean; message?: string }) => {
      if (resp && resp.ok === false) {
        Message.error(resp.message || '呼叫失败')
        return
      }
      callingUserId.value = targetUserId
      Message.info('正在呼叫对方...')
    })
  }

  async function establishOutgoingCall(targetUserId: string) {
    const p = ensurePeer()
    const stream = await getLocalAudioStream()
    const mediaConn = p.call(targetUserId, stream)
    bindConnection(mediaConn)
    ensureDataConnection(targetUserId)
    activeUserId.value = targetUserId
    callingUserId.value = null
    startRecording()
  }

  function answer() {
    if (!incomingCall.value) {
      return
    }
    const socket = ensureSocket()
    const callerId = incomingCall.value.callerUserId
    pendingCallerId.value = callerId
    socket.emit('rtc:answer', { targetUserId: callerId })
  }

  function reject() {
    if (!incomingCall.value) {
      return
    }
    const socket = ensureSocket()
    socket.emit('rtc:reject', { targetUserId: incomingCall.value.callerUserId })
    incomingCall.value = null
    pendingCallerId.value = null
  }

  async function hangup() {
    const socket = getWebSocketClient()
    if (activeUserId.value && socket) {
      socket.emit('rtc:hangup', { targetUserId: activeUserId.value })
    }
    await finalizeRecordingAndTranscribe()
    clearCallState(false)
  }

  function startRecording() {
    if (!localStream.value || recorder.value) {
      return
    }
    recordChunks.value = []
    const mediaRecorder = new MediaRecorder(localStream.value, { mimeType: 'audio/webm' })
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordChunks.value.push(event.data)
      }
    }
    mediaRecorder.onstop = () => {
      recordedBlob.value = new Blob(recordChunks.value, { type: 'audio/webm' })
    }
    mediaRecorder.start()
    recorder.value = mediaRecorder
  }

  function stopRecording(): Promise<Blob | null> {
    if (!recorder.value) {
      return Promise.resolve(recordedBlob.value)
    }
    return new Promise((resolve) => {
      const current = recorder.value
      if (!current) {
        resolve(recordedBlob.value)
        return
      }
      current.onstop = () => {
        const blob = new Blob(recordChunks.value, { type: 'audio/webm' })
        recordedBlob.value = blob
        resolve(blob)
      }
      current.stop()
      recorder.value = null
    })
  }

  async function finalizeRecordingAndTranscribe() {
    const blob = await stopRecording()
    if (!blob || blob.size <= 0) {
      return
    }
    try {
      isTranscribing.value = true
      const text = await transcribeAudio(blob)
      transcribedText.value = text
      Message.success('录音转写完成')
    } catch (err) {
      const msg = err instanceof Error ? err.message : '录音转写失败'
      Message.error(msg)
    } finally {
      isTranscribing.value = false
    }
  }

  function clearCallState(stopRecord: boolean) {
    if (stopRecord) {
      void stopRecording()
    }
    connection.value?.close()
    connection.value = null
    dataConnection.value?.close()
    dataConnection.value = null
    remoteStream.value = null
    activeUserId.value = null
    callingUserId.value = null
    startedAt.value = null
    isSendingAudioFile.value = false
    sendingProgress.value = 0
    sendingFileName.value = ''
    receivingProgress.value = 0
    incomingTransferSessions.clear()
  }

  async function sendAudioFile(file: File) {
    if (!activeUserId.value) {
      throw new Error('当前没有通话中的对端，无法发送音频')
    }
    const conn = ensureDataConnection(activeUserId.value)
    if (!conn.open) {
      throw new Error('文件通道尚未就绪，请稍后重试')
    }

    const transferId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const meta: AudioFileMeta = {
      id: transferId,
      name: file.name,
      mimeType: file.type || 'audio/mpeg',
      size: file.size,
    }
    const chunkSize = 16 * 1024
    const buffer = await file.arrayBuffer()

    isSendingAudioFile.value = true
    sendingProgress.value = 0
    sendingFileName.value = file.name

    try {
      conn.send({
        type: 'audio-meta',
        payload: meta,
      } satisfies AudioMetaMessage)

      let offset = 0
      while (offset < buffer.byteLength) {
        const end = Math.min(offset + chunkSize, buffer.byteLength)
        const chunk = buffer.slice(offset, end)
        conn.send({
          type: 'audio-chunk',
          payload: {
            id: transferId,
            chunk,
          },
        } satisfies AudioChunkMessage)
        offset = end
        sendingProgress.value = Math.min(100, Math.floor((offset / buffer.byteLength) * 100))
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 0)
        })
      }

      conn.send({
        type: 'audio-end',
        payload: { id: transferId },
      } satisfies AudioEndMessage)
      sendingProgress.value = 100
      Message.success(`音频文件发送完成：${file.name}`)
    } finally {
      window.setTimeout(() => {
        isSendingAudioFile.value = false
        sendingProgress.value = 0
        sendingFileName.value = ''
      }, 500)
    }
  }

  function dispose() {
    clearCallState(true)
    for (const item of receivedAudioFiles.value) {
      URL.revokeObjectURL(item.objectUrl)
    }
    receivedAudioFiles.value = []
    localStream.value?.getTracks().forEach((t) => t.stop())
    localStream.value = null
    peer.value?.destroy()
    peer.value = null
  }

  onUnmounted(() => {
    dispose()
  })

  bindSignalingEvents()
  ensurePeer()

  return {
    incomingCall,
    onlineUserIds,
    localStream,
    remoteStream,
    callingUserId,
    activeUserId,
    callDurationSec,
    recordedBlob,
    isTranscribing,
    transcribedText,
    isSendingAudioFile,
    sendingProgress,
    sendingFileName,
    receivingProgress,
    receivedAudioFiles,
    refreshOnlineUsers,
    call,
    answer,
    reject,
    hangup,
    sendAudioFile,
    startRecording,
    stopRecording,
  }
}
