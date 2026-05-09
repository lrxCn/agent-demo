# Phase 5 - Step 1: 文件上传 + 文本解析

## 上下文
AI 对话集成已完成（Phase 4）。现在实现知识库功能。
请参阅 @docs/API_CONTRACTS.md 和 @docs/ARCHITECTURE.md。

## 任务

### 1. 安装 NestJS 文件上传依赖
```bash
cd packages/backend
pnpm add @nestjs/platform-express multer pdf-parse
pnpm add -D @types/multer
```

### 2. 创建 Knowledge 模块
- `src/knowledge/knowledge.service.ts`
- `src/knowledge/knowledge.controller.ts`
- `src/knowledge/knowledge.module.ts`
- `src/knowledge/dto/create-knowledge.dto.ts`

### 3. 文件上传接口
`POST /api/v1/knowledge/upload`
- 使用 @UseInterceptors(FileInterceptor('file'))
- 支持 .txt, .md, .pdf 文件类型
- txt/md：直接读取文本内容
- pdf：使用 pdf-parse 提取文本
- 将文件信息保存到 knowledge_bases 表
- 将提取的文本内容通过 HTTP 发送给 Agent 做向量化处理

### 4. 知识库 CRUD 接口
参照 API_CONTRACTS.md 实现列表、删除、角色权限设置。

## 验证
```bash
# 上传 txt 文件
curl -X POST http://localhost:3000/api/v1/knowledge/upload \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@test.txt" \
  -F "name=测试知识库"
```

## 完成后
更新 PROJECT_STATUS.md 标记 5-1 为 ✅
