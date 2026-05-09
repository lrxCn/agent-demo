# Phase 3 - Step 6: 学生管理页面

## 上下文
角色管理已完成。参照 @docs/API_CONTRACTS.md 学生模块接口。

## 任务

### 1. 创建 API `src/api/modules/student.ts`

### 2. 创建学生管理页面 `src/views/student/StudentListView.vue`
- 数据表格（分页、排序）
- 搜索栏（按姓名/学号搜索）
- 新增学生弹窗
- 编辑学生弹窗
- 删除（单个 + 批量选择删除）
- 批量导入按钮（弹窗表单，支持多条数据输入）
- 表格行复选框用于批量操作

### 3. 权限控制
根据 student:xxx 权限控制按钮显示。

## 验证
- 能增删改查学生
- 批量删除正常
- 分页和搜索正常

## 完成后
更新 PROJECT_STATUS.md 标记 3-6 为 ✅，整个 Phase 3 完成。

```bash
git add .
git commit -m "feat: Phase 3 完成 - 前端基础页面（登录/权限/用户/角色/学生）"
```
