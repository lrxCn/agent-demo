/**
 * 全局 WebSocket 连接管理
 *
 * 使用 Socket.io 连接 /ws，JWT 认证。
 * 监听 tool:invoke 事件，调用 useToolExecutor 执行，回传 tool:result。
 */
import { Message } from '@arco-design/web-vue'
import { onMounted, onUnmounted, shallowRef } from 'vue'
import { io } from 'socket.io-client'
import { useAuthStore } from '../stores/auth'
import { useToolExecutor } from './useToolExecutor'
import { bindSocketToRegistry } from './useToolRegistry'

/** tool:invoke 事件负载（与后端 pushToolInvoke 对齐） */
interface ToolInvokePayload {
  id: string
  tool: string
  params: Record<string, unknown>
}

type WebSocketClient = ReturnType<typeof io>

const sharedSocket = shallowRef<WebSocketClient | null>(null)
const sharedConnected = shallowRef(false)

export function getWebSocketClient(): WebSocketClient | null {
  return sharedSocket.value
}

export function useWebSocket() {
  const auth = useAuthStore()
  const { execute } = useToolExecutor()
  const socket = sharedSocket
  const connected = sharedConnected

  function connect(): void {
    const token = auth.token?.trim()
    if (!token) {
      return
    }

    // 断开旧连接
    if (sharedSocket.value) {
      sharedSocket.value.disconnect()
    }

    const s = io('/ws', {
      query: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionAttempts: 10,
    })

    s.on('connect', () => {
      sharedConnected.value = true
      bindSocketToRegistry(s)
    })

    s.on('disconnect', () => {
      sharedConnected.value = false
      bindSocketToRegistry(null)
    })

    s.on('connect_error', () => {
      sharedConnected.value = false
    })

    // 监听后端推送的 tool:invoke 事件
    s.on('tool:invoke', async (payload: ToolInvokePayload) => {
      const { id, tool, params } = payload

      try {
        const result = await execute(tool, params)

        if (result.cancelled) {
          Message.info('已取消操作')
        } else if (result.success) {
          Message.success(`操作已执行: ${tool}`)
        }

        // 回传工具执行结果
        s.emit('tool:result', {
          id,
          success: result.success,
          result: result.result,
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : '工具执行异常'
        s.emit('tool:result', {
          id,
          success: false,
          result: msg,
        })
      }
    })

    sharedSocket.value = s
  }

  function disconnect(): void {
    if (sharedSocket.value) {
      sharedSocket.value.disconnect()
      sharedSocket.value = null
      sharedConnected.value = false
    }
  }

  onMounted(() => {
    connect()
  })

  onUnmounted(() => {
    disconnect()
  })

  return { socket, connected, connect, disconnect }
}
