# Phase 5 - Step 4: 知识库管理页面

## 上下文
RAG 后端已完成。现在做前端页面。

## 任务

### 1. 创建 API `src/api/modules/knowledge.ts`

### 2. 创建知识库页面 `src/views/knowledge/KnowledgeListView.vue`
- 知识库列表（表格：名称、文件类型、创建时间、角色权限）
- 上传按钮 → 弹窗（选择文件 + 输入知识库名称）
- 支持 .txt .md .pdf 文件
- 上传进度显示
- 删除按钮
- 设置角色权限按钮 → 弹窗（多选角色列表）

### 3. 路由注册
在 routes.ts 中添加 `/knowledge` 路由，需要 `knowledge:view` 权限。

## 验证
- 上传一个 txt 文件，知识库列表中出现
- 设置角色权限后，用不同角色的用户通过 AI 对话查询，验证权限过滤

## 完成后
更新 PROJECT_STATUS.md 标记 5-4 为 ✅
