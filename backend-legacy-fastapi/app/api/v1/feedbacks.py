from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.schemas.schemas import FeedbackCreate, FeedbackOut
from app.core.security import sanitize_input
from app.core.deps import get_current_user
from app.db.session import get_db
from app.db.models import Feedback, User

router = APIRouter(prefix="/feedbacks", tags=["Feedbacks & Discussion Threads"])

@router.get("", response_model=List[FeedbackOut])
async def list_feedbacks(
    milestone_id: Optional[int] = Query(None),
    document_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Feedback)
    if milestone_id:
        query = query.where(Feedback.milestone_id == milestone_id)
    if document_id:
        query = query.where(Feedback.document_id == document_id)

    query = query.order_by(Feedback.created_at.asc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("", response_model=FeedbackOut, status_code=201)
async def post_feedback(
    feedback_in: FeedbackCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not feedback_in.milestone_id and not feedback_in.document_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Bắt buộc phải truyền milestone_id hoặc document_id",
        )

    if feedback_in.milestone_id and feedback_in.document_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Chỉ được gắn feedback cho milestone_id HOẶC document_id (không truyền cả 2)",
        )

    new_feedback = Feedback(
        milestone_id=feedback_in.milestone_id,
        document_id=feedback_in.document_id,
        user_id=current_user.id,
        content=sanitize_input(feedback_in.content),
        parent_id=feedback_in.parent_id,
        file_url=feedback_in.file_url,
    )
    db.add(new_feedback)
    await db.commit()
    await db.refresh(new_feedback)
    return new_feedback

@router.post("/{feedback_id}/resolve", response_model=FeedbackOut)
async def resolve_feedback(
    feedback_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    fb = result.scalar_one_or_none()
    if not fb:
        raise HTTPException(status_code=404, detail="Bình luận không tồn tại")

    fb.is_resolved = not fb.is_resolved
    fb.resolved_by = current_user.id if fb.is_resolved else None
    await db.commit()
    await db.refresh(fb)
    return fb

@router.delete("/{feedback_id}")
async def delete_feedback(
    feedback_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Feedback).where(Feedback.id == feedback_id))
    fb = result.scalar_one_or_none()
    if not fb:
        raise HTTPException(status_code=404, detail="Bình luận không tồn tại")

    await db.delete(fb)
    await db.commit()
    return {"status": "deleted", "id": feedback_id}
