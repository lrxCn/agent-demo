# Phase 2 - Step 5: Student 模块

## 上下文
RBAC 已完成。请参照 @docs/API_CONTRACTS.md 学生模块接口。

## 任务

### 1. 创建 Student 模块
- `src/student/dto/create-student.dto.ts` - name, student_no, gender, class_name, phone, email
- `src/student/dto/update-student.dto.ts`
- `src/student/student.service.ts` - CRUD + 批量操作
- `src/student/student.controller.ts`
- `src/student/student.module.ts`

### 2. 接口列表
参照 API_CONTRACTS.md：
- GET /api/v1/students - 分页查询（支持 keyword 搜索姓名/学号）
- GET /api/v1/students/:id
- POST /api/v1/students - 创建单个
- PUT /api/v1/students/:id - 更新
- DELETE /api/v1/students/:id - 删除
- POST /api/v1/students/batch - 批量创建（body: { items: [] }）
- DELETE /api/v1/students/batch - 批量删除（body: { ids: [] }）

### 3. 权限控制
所有接口需要 JWT 认证 + 对应的 student:xxx 权限。

## 验证
```bash
# 创建学生
curl -X POST http://localhost:3000/api/v1/students \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"张三","student_no":"S001","gender":"男","class_name":"一班","phone":"13800000001","email":"zhang@test.com"}'

# 查询
curl http://localhost:3000/api/v1/students?page=1&pageSize=10 \
  -H "Authorization: Bearer <TOKEN>"

# 批量删除
curl -X DELETE http://localhost:3000/api/v1/students/batch \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"ids":["<ID1>","<ID2>"]}'
```

## 完成后
更新 PROJECT_STATUS.md 标记 2-5 为 ✅
