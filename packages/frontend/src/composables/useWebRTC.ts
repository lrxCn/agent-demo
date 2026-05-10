import { Message } from '@arco-design/web-vue'
import Peer, { type MediaConnection } from 'peerjs'
import { computed, onUnmounted, ref } from 'vue'
import { useAuthStore } from '../stores/auth'
import { getWebSocketClient } from './useWebSocket'

interface IncomingCallInfo {
  callerUserId: string
}

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

  const peer = ref<Peer | null>(null)
  const connection = ref<MediaConnection | null>(null)
  const localStream = ref<MediaStream | null>(null)
  const remoteStream = ref<MediaStream | null>(null)
  const incomingCall = ref<IncomingCallInfo | null>(null)
  const pendingCallerId = ref<string | null>(null)
  const callingUserId = ref<string | null>(null)
  const activeUserId = ref<string | null>(null)
  const startedAt = ref<number | null>(null)
  const recorder = ref<MediaRecorder | null>(null)
  const recordChunks = ref<Blob[]>([])
  const recordedBlob = ref<Blob | null>(null)
  const onlineUserIds = ref<string[]>([])

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
        clearCallState(true)
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

  function hangup() {
    const socket = getWebSocketClient()
    if (activeUserId.value && socket) {
      socket.emit('rtc:hangup', { targetUserId: activeUserId.value })
    }
    clearCallState(true)
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

  function stopRecording(): Blob | null {
    if (!recorder.value) {
      return recordedBlob.value
    }
    recorder.value.stop()
    recorder.value = null
    return recordedBlob.value
  }

  function clearCallState(stopRecord: boolean) {
    if (stopRecord) {
      stopRecording()
    }
    connection.value?.close()
    connection.value = null
    remoteStream.value = null
    activeUserId.value = null
    callingUserId.value = null
    startedAt.value = null
  }

  function dispose() {
    clearCallState(true)
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
    refreshOnlineUsers,
    call,
    answer,
    reject,
    hangup,
    startRecording,
    stopRecording,
  }
}
