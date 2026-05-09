# Phase 1 - Step 2: 工具注册中心 ToolRegistry

## 上下文
基础图结构已完成。请先阅读 @.cursor/rules/02-agent-patterns.mdc 了解工具注册中心的设计约定。

## 任务
创建 `packages/agent/src/tools/registry.py`，实现工具注册中心：

```python
"""工具注册中心 - 支持按类别/标签动态加载工具"""
from typing import Callable, Optional
from langchain_core.tools import BaseTool
from dataclasses import dataclass, field


@dataclass
class ToolMeta:
    """工具元数据"""
    tool: BaseTool
    category: str  # "builtin" | "frontend"
    tags: list[str] = field(default_factory=list)
    description: str = ""


class ToolRegistry:
    """工具注册中心
    
    支持：
    - 按类别注册和查询工具（builtin, frontend）
    - 按标签筛选工具
    - 按名称列表筛选（用于前端按需加载）
    """
    
    def __init__(self):
        self._tools: dict[str, ToolMeta] = {}
    
    def register(self, tool: BaseTool, category: str = "builtin", tags: list[str] = None):
        """注册一个工具"""
        self._tools[tool.name] = ToolMeta(
            tool=tool,
            category=category,
            tags=tags or [],
            description=tool.description,
        )
    
    def unregister(self, name: str):
        """注销一个工具"""
        self._tools.pop(name, None)
    
    def get_tools(
        self,
        categories: list[str] = None,
        tags: list[str] = None,
        names: list[str] = None,
    ) -> list[BaseTool]:
        """按条件获取工具列表
        
        Args:
            categories: 按类别筛选，如 ["builtin"]
            tags: 按标签筛选（任一匹配），如 ["math", "query"]
            names: 按名称精确筛选，如 ["create_student"]
        
        Returns:
            符合条件的工具列表
        """
        result = []
        for name, meta in self._tools.items():
            # 名称筛选
            if names is not None and name not in names:
                continue
            # 类别筛选
            if categories is not None and meta.category not in categories:
                continue
            # 标签筛选（任一匹配）
            if tags is not None and not any(t in meta.tags for t in tags):
                continue
            result.append(meta.tool)
        return result
    
    def get_all_tools(self) -> list[BaseTool]:
        """获取所有已注册的工具"""
        return [meta.tool for meta in self._tools.values()]
    
    def list_tools(self) -> list[dict]:
        """列出所有工具的元数据（用于调试）"""
        return [
            {
                "name": name,
                "category": meta.category,
                "tags": meta.tags,
                "description": meta.description,
            }
            for name, meta in self._tools.items()
        ]


# 全局单例
registry = ToolRegistry()
```

## 验证
```bash
cd packages/agent
uv run python -c "
from src.tools.registry import registry
print('工具注册中心创建成功')
print('当前工具数量:', len(registry.list_tools()))
"
```

## 完成后
更新 @docs/PROJECT_STATUS.md 将 Phase 1 Step 1-2 状态改为 ✅
