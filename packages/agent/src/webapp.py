"""LangGraph 自定义 HTTP 端点。"""

from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from src.rag.indexer import index_call_transcript, index_document

app = FastAPI()


class IngestKnowledgeRequest(BaseModel):
    """知识库入库请求体。"""

    text: str = Field(min_length=1)
    filename: str | None = None
    knowledge_base_id: str | None = None
    role_ids: list[str] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


@app.post("/knowledge/ingest")
def ingest_knowledge(payload: IngestKnowledgeRequest) -> dict[str, Any]:
    """接收文档文本并触发向量化入库。"""
    merged_metadata = {
        **payload.metadata,
        "filename": payload.filename,
        "knowledge_base_id": payload.knowledge_base_id,
        "role_ids": payload.role_ids,
    }
    try:
        chunk_count = index_document(payload.text, merged_metadata)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"索引失败: {exc}") from exc
    return {"ok": True, "chunks": chunk_count}


class IngestCallRequest(BaseModel):
    """通话记录入库请求体。"""

    text: str = Field(min_length=1)
    caller_user_id: str
    callee_user_id: str
    call_time: str


@app.post("/calls/ingest")
def ingest_call(payload: IngestCallRequest) -> dict[str, Any]:
    """接收通话记录并触发向量化入库。"""
    try:
        chunk_count = index_call_transcript(
            text=payload.text,
            caller_user_id=payload.caller_user_id,
            callee_user_id=payload.callee_user_id,
            call_time=payload.call_time,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"索引通话记录失败: {exc}") from exc

    return {"ok": True, "chunks": chunk_count}
