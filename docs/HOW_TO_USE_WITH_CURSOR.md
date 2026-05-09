# 如何与 Cursor 配合开发本项目

## 核心原则

Cursor 是一个能力很强但"记性不好"的助手。你要做的就是：
1. 每次只给它一个小任务
2. 用文档帮它恢复记忆
3. 出了问题就开新会话

---

## 准备工作

### 1. 用 Cursor 打开项目
将 `agent-demo/` 文件夹用 Cursor 打开（File → Open Folder）。

### 2. 检查 Cursor 规则是否生效
打开 Cursor Settings → Features → 确认 "Project Rules" 已启用。
项目中的 `.cursor/rules/` 目录会自动被 Cursor 读取：
- `00-project-context.mdc` — 始终生效，告诉 Cursor 技术栈和项目结构
- `01-coding-standards.mdc` — 始终生效，编码规范
- `02-agent-patterns.mdc` — 只在编辑 `packages/agent/` 下的文件时生效
- `03-nestjs-patterns.mdc` — 只在编辑 `packages/backend/` 下的文件时生效
- `04-vue-patterns.mdc` — 只在编辑 `packages/frontend/` 下的文件时生效

### 3. 配置 .cursorignore
在项目根目录创建 `.cursorignore`（如果还没有），防止 Cursor 被无关文件干扰：
```
node_modules/
dist/
.venv/
__pycache__/
*.db
*.sqlite
prompts/
```

### 4. 开启 Codebase Indexing
Cursor Settings → Features → Codebase Indexing → 点击 "Reindex"。
每次大量文件变更后建议重新索引。

---

## 日常开发流程

### 第一次使用

```
第 1 步：打开 Cursor Composer（Cmd+I 或点击右上角图标）
第 2 步：打开 prompts/phase-0/step-1-init-monorepo.md
第 3 步：复制文件的全部内容
第 4 步：粘贴到 Composer 输入框，回车发送
第 5 步：Cursor 会开始执行任务
第 6 步：执行完毕后，按照 prompt 文件中的"验证"部分检查结果
第 7 步：验证通过 → 在终端执行 git add . && git commit -m "描述"
第 8 步：打开下一个 prompt 文件，重复以上步骤
```

### Prompt 文件的执行顺序

```
Phase 0（脚手架）:
  step-1 → step-4 → step-5 → step-6 → step-7
  （step-2 和 step-3 已完成，不需要执行）

Phase 1（Agent 核心）:
  step-1 → step-2 → step-3 → step-4 → step-6 → step-7 → step-8 → step-9
  （step-4 已包含 step-5 的内容）

Phase 2（后端）:
  step-1 → step-2 → step-3 → step-4 → step-5 → step-6 → step-7

Phase 3（前端）:
  step-1 → step-2 → step-3 → step-4 → step-5 → step-6

Phase 4（AI 对话）:
  step-1 → step-2 → step-3 → step-4 → step-5 → step-6

Phase 5（知识库）:
  step-1 → step-2 → step-3 → step-4 → step-5

Phase 6（语音通话）:
  step-1 → step-2 → step-3 → step-4 → step-5 → step-6
```

---

## 关键技巧

### 技巧 1：用 @ 符号精确引用文件

在 Composer 中用 `@` 可以精确指定 Cursor 要看哪个文件。例如：

```
请参考 @docs/ARCHITECTURE_FOR_AI.md 了解项目架构，
然后修改 @packages/backend/src/user/user.service.ts 添加分页查询功能。
```

这比让 Cursor 自己搜索文件要精确得多。

### 技巧 2：上下文污染时开新会话

当你发现 Cursor 开始：
- 重复之前的错误
- 引用已删除的文件
- 输出与要求无关的代码
- 反复修不好一个 bug

立刻关闭当前 Composer 会话，开一个新的，然后说：

```
请先阅读 @docs/PROJECT_STATUS.md 了解当前项目进度和已完成的步骤，
然后阅读 @docs/ARCHITECTURE_FOR_AI.md 了解项目架构。
我现在需要你帮我完成 Phase X Step Y 的任务。
```

### 技巧 3：每步完成后更新进度文件

每完成一个步骤，手动或让 Cursor 更新 `docs/PROJECT_STATUS.md`：
- 把对应步骤的 ⬜ 改为 ✅
- 如果有问题改为 ❌ 并在备注栏写明问题

这个文件是 Cursor 会话之间的"接力棒"。新会话读了它就知道做到哪了。

### 技巧 4：验证失败时的处理

如果某个步骤验证失败：

1. 不要急着在同一个会话里反复修
2. 看看错误信息，把关键报错复制下来
3. 开新会话，贴上错误信息，让 Cursor 专门修这个 bug
4. 修好后重新验证
5. 如果连续 3 次修不好，考虑 git reset 回到上一个好的 commit，重新执行这一步

### 技巧 5：不要让 Cursor 同时改太多文件

如果你自己想让 Cursor 做一些 prompt 文件之外的事情：

✅ 好的做法：
```
请修改 @packages/backend/src/student/student.service.ts，
给 findAll 方法添加按 class_name 字段过滤的功能。
```

❌ 不好的做法：
```
请重构整个后端的错误处理机制，统一所有模块的异常格式。
```

一次改一个文件，一次解决一个问题。

### 技巧 6：利用 Cursor 的 Tab 补全

在日常编码中（不是用 Composer），Cursor 的 Tab 补全也很强。
因为 `.cursor/rules/` 中已经定义了编码规范，Tab 补全会自动遵循规范。

### 技巧 7：Yolo Mode（可选，进阶用户）

如果你信任测试套件，可以在 Cursor Settings → Features → 开启 "Auto-run"。
Cursor 会自动运行终端命令来验证代码，不需要你每次手动确认。
建议在 Phase 1-2（有明确的命令行验证）时开启。

---

## 常见问题

### Q: Cursor 说找不到某个文件
A: 可能是 Codebase Indexing 过期了。去 Settings → Features → Codebase Indexing → Reindex。

### Q: Cursor 生成的代码格式不对
A: 检查 `.cursor/rules/` 文件是否存在且格式正确。用 `@.cursor/rules/01-coding-standards.mdc` 显式引用让它重新读。

### Q: Cursor 修了一个 bug 但引入了新 bug
A: 用 `git diff` 看改了什么，如果太乱就 `git checkout .` 回退，开新会话重来。

### Q: 一个步骤太大了 Cursor 做不完
A: 把 prompt 文件的内容拆成 2-3 个小任务分别发给 Cursor。比如"先只创建 entity 文件"，然后"基于刚才的 entity 创建 service"。

### Q: Phase 之间的切换需要注意什么
A: 每个 Phase 完成后做一次 git commit 和 tag，这是安全检查点。例如：
```bash
git add . && git commit -m "feat: Phase 1 完成"
git tag phase-1-done
```

---

## 文件说明速查

| 文件 | 谁写的 | 用途 |
|------|--------|------|
| `.cursor/rules/*.mdc` | Antigravity | Cursor 自动读取的规则 |
| `docs/ARCHITECTURE.md` | Antigravity | 人类阅读的架构文档（有图表） |
| `docs/ARCHITECTURE_FOR_AI.md` | Antigravity | Cursor 阅读的架构文档（纯文字） |
| `docs/API_CONTRACTS.md` | Antigravity | 前后端接口契约 |
| `docs/PROJECT_STATUS.md` | 你+Cursor | 进度追踪（接力棒） |
| `prompts/phase-*/step-*.md` | Antigravity | 给 Cursor 的分步指令 |
| `README.md` | Antigravity | 项目对外介绍 |
