# Phase 4 - Step 1: 浮动聊天气泡组件

## 上下文
前端基础页面已完成（Phase 3）。现在实现 AI 聊天浮窗。

## 任务

### 1. 创建聊天组件 `src/components/chat/ChatBubble.vue`
- 右下角固定位置的圆形浮动按钮（蓝紫渐变色）
- 点击展开聊天面板（400px 宽, 600px 高，圆角 + 阴影）
- 聊天面板包含：
  - 标题栏（AI 助手标题 + 关闭按钮）
  - 消息列表区域（滚动，自动滚到底部）
  - 输入区域（输入框 + 发送按钮）
- 消息气泡：用户消息靠右（蓝紫色），AI 消息靠左（深灰色）
- 支持 Markdown 渲染（安装 markdown-it）
- loading 状态：AI 回复时显示打字动画

### 2. 创建 chat store `src/stores/chat.ts`
```typescript
// state: messages[], currentThreadId, isOpen, isLoading
// actions: sendMessage, toggleChat, clearMessages
```

### 3. 在 AppLayout 中引入 ChatBubble 组件
放在布局最外层，所有页面都能看到。

### 4. 安装 markdown-it
```bash
pnpm add markdown-it
pnpm add -D @types/markdown-it
```

## 验证
- 右下角能看到浮动按钮
- 点击展开聊天面板
- 输入消息后显示在右侧（此时还没对接后端，先用假数据模拟）
- 关闭和展开交互正常

## 完成后
更新 PROJECT_STATUS.md 标记 4-1 为 ✅
