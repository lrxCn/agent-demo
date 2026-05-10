"""前端工具注册"""
from src.tools.frontend.schemas import (
    create_student,
    delete_student,
    navigate_to_page,
    query_students,
)
from src.tools.registry import registry


def register_frontend_tools() -> None:
    """注册所有前端工具到全局 ToolRegistry"""
    registry.register(navigate_to_page, category='frontend', tags=['navigation'])
    registry.register(create_student, category='frontend', tags=['student', 'crud'])
    registry.register(delete_student, category='frontend', tags=['student', 'crud'])
    registry.register(query_students, category='frontend', tags=['student', 'query'])
