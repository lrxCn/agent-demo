# Phase 0 - Step 1: 初始化 Monorepo

## 上下文
这是一个全新的 AI Agent 全栈项目，采用 monorepo 结构。请先阅读 @docs/ARCHITECTURE.md 了解整体架构。

## 任务
1. 在项目根目录初始化 git 仓库：`git init`
2. 创建 `pnpm-workspace.yaml`：
```yaml
packages:
  - 'packages/*'
```
3. 创建根目录 `package.json`：
```json
{
  "name": "agent-demo",
  "private": true,
  "scripts": {
    "dev:frontend": "pnpm -C packages/frontend dev",
    "dev:backend": "pnpm -C packages/backend start:dev",
    "dev:agent": "cd packages/agent && uv run langgraph dev"
  }
}
```
4. 创建 `.gitignore`：
```
node_modules/
dist/
.env
*.db
*.sqlite
__pycache__/
.venv/
.pytest_cache/
*.pyc
.DS_Store
```
5. 创建 `packages/` 目录（如果不存在）

## 验证
- `git status` 能看到仓库已初始化
- `cat pnpm-workspace.yaml` 内容正确
- 目录结构：项目根目录包含 `pnpm-workspace.yaml`、`package.json`、`.gitignore`、`packages/`

## 完成后
更新 @docs/PROJECT_STATUS.md 将 Phase 0 Step 0-1 状态改为 ✅
