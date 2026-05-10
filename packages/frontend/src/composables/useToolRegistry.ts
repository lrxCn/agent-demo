/**
 * 前端工具注册中心
 *
 * 各页面在 onMounted 时注册当前页面可用的工具，
 * onUnmounted 时自动注销。工具列表变化时通过 WebSocket 通知后端。
 */
import { onUnmounted, ref } from 'vue'
import type { Socket } from 'socket.io-client'

/** 工具定义（页面注册时传入） */
export interface ToolDefinition {
  name: string
  description: string
  requireConfirm?: boolean
}

/** 全局工具注册表（跨组件共享） */
const registeredTools = ref<Map<string, ToolDefinition>>(new Map())

/** 全局 Socket 引用，由 useWebSocket 初始化时设置 */
let globalSocket: Socket | null = null

/** 供 useWebSocket 调用，绑定 socket 实例 */
export function bindSocketToRegistry(socket: Socket | null): void {
  globalSocket = socket
}

/** 通过 WebSocket 通知后端当前可用工具列表 */
function notifyBackend(): void {
  if (!globalSocket?.connected) {
    return
  }
  const tools = [...registeredTools.value.keys()]
  globalSocket.emit('tools:update', { tools })
}

/** 获取当前所有已注册的工具名列表 */
export function getRegisteredToolNames(): string[] {
  return [...registeredTools.value.keys()]
}

export function useToolRegistry() {
  /** 当前组件注册的工具名（用于卸载时批量注销） */
  const localTools: string[] = []

  function register(tool: ToolDefinition): void {
    registeredTools.value.set(tool.name, tool)
    localTools.push(tool.name)
    notifyBackend()
  }

  function unregister(toolName: string): void {
    registeredTools.value.delete(toolName)
    const idx = localTools.indexOf(toolName)
    if (idx >= 0) {
      localTools.splice(idx, 1)
    }
    notifyBackend()
  }

  // 组件卸载时自动注销该组件注册的所有工具
  onUnmounted(() => {
    for (const name of localTools) {
      registeredTools.value.delete(name)
    }
    localTools.length = 0
    notifyBackend()
  })

  return { register, unregister, registeredTools }
}
