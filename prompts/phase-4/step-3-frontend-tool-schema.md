# Phase 4 - Step 3: 前端工具 Schema 定义（Agent 端）

## 上下文
流式聊天已完成。现在在 Agent 端定义前端工具的 schema。

## 任务

### 1. 创建 `packages/agent/src/tools/frontend/schemas.py`
定义前端可执行的工具 schema（这些工具 Agent 会通过结构化输出请求前端执行）：

```python
"""前端工具 Schema 定义"""
from langchain_core.tools import tool


@tool
def navigate_to_page(path: str, confirm_message: str = "") -> str:
    """导航到指定页面。需要用户确认后才会执行。
    
    Args:
        path: 目标页面路径，如 /students, /users, /roles
        confirm_message: 显示给用户的确认信息
    """
    return f"请求导航到 {path}"


@tool
def create_student(name: str, student_no: str, gender: str, class_name: str, phone: str = "", email: str = "") -> str:
    """创建新学生记录。需要用户确认。
    
    Args:
        name: 学生姓名
        student_no: 学号
        gender: 性别（男/女）
        class_name: 班级
        phone: 手机号（可选）
        email: 邮箱（可选）
    """
    return f"请求创建学生: {name}"


@tool
def delete_student(student_id: str, student_name: str) -> str:
    """删除学生记录。需要用户确认。
    
    Args:
        student_id: 学生 ID
        student_name: 学生姓名（用于确认提示）
    """
    return f"请求删除学生: {student_name}"


@tool
def query_students(keyword: str = "", page: int = 1) -> str:
    """查询学生列表。
    
    Args:
        keyword: 搜索关键词（姓名或学号）
        page: 页码
    """
    return f"请求查询学生: keyword={keyword}"
```

### 2. 注册前端工具到 ToolRegistry
创建 `packages/agent/src/tools/frontend/__init__.py`：
```python
from src.tools.registry import registry
from src.tools.frontend.schemas import navigate_to_page, create_student, delete_student, query_students

def register_frontend_tools():
    registry.register(navigate_to_page, category="frontend", tags=["navigation"])
    registry.register(create_student, category="frontend", tags=["student", "crud"])
    registry.register(delete_student, category="frontend", tags=["student", "crud"])
    registry.register(query_students, category="frontend", tags=["student", "query"])
```

### 3. 修改 chat_node 中的工具加载逻辑
```python
# 根据 state["available_frontend_tools"] 按需加载前端工具
builtin_tools = registry.get_tools(categories=["builtin"])
frontend_tools = registry.get_tools(
    categories=["frontend"],
    names=state.get("available_frontend_tools", [])
)
tools = builtin_tools + frontend_tools
```

## 验证
Agent 能在有前端工具可用时识别并调用它们（此时工具只返回文字，实际执行在 Step 4 实现）。

## 完成后
更新 PROJECT_STATUS.md 标记 4-3 为 ✅
