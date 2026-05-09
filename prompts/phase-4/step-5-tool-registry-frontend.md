# Phase 4 - Step 5: 前端工具注册中心

## 上下文
工具调用链路已通。现在实现前端工具的按页面按需注册。
请参阅 @.cursor/rules/04-vue-patterns.mdc 中的工具注册中心设计。

## 任务

### 1. 创建 `src/composables/useToolRegistry.ts`
```typescript
import { ref, onMounted, onUnmounted, watch } from 'vue'

interface ToolDefinition {
  name: string
  description: string
  handler: (params: Record<string, unknown>) => Promise<unknown>
  requireConfirm?: boolean
}

// 全局工具注册表
const registeredTools = ref<Map<string, ToolDefinition>>(new Map())

export function useToolRegistry() {
  const localTools: string[] = []
  
  function register(tool: ToolDefinition) {
    registeredTools.value.set(tool.name, tool)
    localTools.push(tool.name)
    notifyBackend()
  }
  
  function unregister(toolName: string) {
    registeredTools.value.delete(toolName)
    notifyBackend()
  }
  
  function notifyBackend() {
    // 通过 WebSocket 发送 tools:update 事件
    // 将当前所有已注册的工具名列表发送给后端
  }
  
  // 组件卸载时自动注销该组件注册的工具
  onUnmounted(() => {
    localTools.forEach(name => registeredTools.value.delete(name))
    notifyBackend()
  })
  
  return { register, unregister, registeredTools }
}
```

### 2. 在学生管理页面中使用
```vue
<!-- StudentListView.vue -->
<script setup>
const { register } = useToolRegistry()

onMounted(() => {
  register({
    name: 'create_student',
    description: '创建新学生',
    handler: async (params) => {
      // 调用 student API 创建学生
      const result = await studentApi.create(params)
      // 刷新列表
      await fetchStudents()
      return result
    },
    requireConfirm: true,
  })
  register({
    name: 'delete_student',
    description: '删除学生',
    handler: async (params) => { /* ... */ },
    requireConfirm: true,
  })
  register({
    name: 'query_students',
    description: '查询学生',
    handler: async (params) => { /* ... */ },
    requireConfirm: false,
  })
})
</script>
```

### 3. 导航工具始终注册
`navigate_to_page` 在 AppLayout 中注册，全局可用。

## 验证
- 在学生管理页面，聊天中说"帮我查学生" → 触发 query_students 工具
- 切换到其他页面，聊天中说同样的话 → Agent 不会调用 student 工具（因为已注销）
- navigate 工具在任何页面都可用

## 完成后
更新 PROJECT_STATUS.md 标记 4-5 为 ✅
