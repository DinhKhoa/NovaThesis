from fastapi import APIRouter, HTTPException, UploadFile, File, Depends, Query, Form
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.schemas.schemas import DocumentOut
from app.core.security import sanitize_input
from app.core.deps import get_current_user
from app.db.session import get_db
from app.db.models import Document, AIStatus, User

router = APIRouter(prefix="/documents", tags=["Documents & RAG Vector Ingestion"])

@router.get("", response_model=List[DocumentOut])
async def list_documents(
    thesis_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Document)
    if thesis_id:
        query = query.where(Document.thesis_id == thesis_id)

    query = query.order_by(Document.created_at.desc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/upload", response_model=DocumentOut, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    thesis_id: int = Form(...),
    tags: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filename = sanitize_input(file.filename or "uploaded.pdf")
    file_path = f"/uploads/{filename}"
    
    tag_list = [t.strip() for t in tags.split(",")] if tags else ["General"]

    new_doc = Document(
        thesis_id=thesis_id,
        filename=filename,
        file_path=file_path,
        file_size=3200000,
        summary_ai="Đang xử lý RAG ingestion & pgvector vectorization...",
        status_ai=AIStatus.PROCESSING,
        tags=tag_list,
    )
    db.add(new_doc)
    await db.commit()
    await db.refresh(new_doc)
    return new_doc

@router.delete("/{doc_id}")
async def delete_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Document).where(Document.id == doc_id))
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Tài liệu không tồn tại")

    await db.delete(doc)
    await db.commit()
    return {"status": "deleted", "id": doc_id}
