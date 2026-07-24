from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.schemas.schemas import ThesisCreate, ThesisUpdate, ThesisOut, ThesisRejectRequest, PaginatedResponse
from app.core.security import sanitize_input
from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.db.models import Thesis, ThesisStatus, User, UserRole

router = APIRouter(prefix="/theses", tags=["Theses & FSM"])

@router.get("", response_model=PaginatedResponse[ThesisOut])
async def list_theses(
    status_filter: Optional[ThesisStatus] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    query = select(Thesis)
    count_query = select(func.count(Thesis.id))

    if status_filter:
        query = query.where(Thesis.status == status_filter)
        count_query = count_query.where(Thesis.status == status_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    offset = (page - 1) * page_size
    query = query.order_by(Thesis.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    items = result.scalars().all()

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }

@router.get("/{thesis_id}", response_model=ThesisOut)
async def get_thesis(
    thesis_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Thesis).where(Thesis.id == thesis_id))
    thesis = result.scalar_one_or_none()
    if not thesis:
        raise HTTPException(status_code=404, detail="Đề tài không tồn tại")
    return thesis

@router.post("", response_model=ThesisOut, status_code=201)
async def create_thesis(
    thesis_in: ThesisCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    new_thesis = Thesis(
        title=sanitize_input(thesis_in.title),
        description=sanitize_input(thesis_in.description) if thesis_in.description else None,
        field=sanitize_input(thesis_in.field),
        status=ThesisStatus.PENDING,
        lecturer_id=thesis_in.lecturer_id,
    )
    db.add(new_thesis)
    await db.commit()
    await db.refresh(new_thesis)
    return new_thesis

@router.patch("/{thesis_id}", response_model=ThesisOut)
async def update_thesis(
    thesis_id: int,
    thesis_in: ThesisUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Thesis).where(Thesis.id == thesis_id))
    thesis = result.scalar_one_or_none()
    if not thesis:
        raise HTTPException(status_code=404, detail="Đề tài không tồn tại")

    if thesis_in.title is not None:
        thesis.title = sanitize_input(thesis_in.title)
    if thesis_in.description is not None:
        thesis.description = sanitize_input(thesis_in.description)
    if thesis_in.field is not None:
        thesis.field = sanitize_input(thesis_in.field)
    if thesis_in.lecturer_id is not None:
        thesis.lecturer_id = thesis_in.lecturer_id
    if thesis_in.status is not None:
        thesis.status = thesis_in.status

    await db.commit()
    await db.refresh(thesis)
    return thesis

@router.delete("/{thesis_id}")
async def delete_thesis(
    thesis_id: int,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.LECTURER])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Thesis).where(Thesis.id == thesis_id))
    thesis = result.scalar_one_or_none()
    if not thesis:
        raise HTTPException(status_code=404, detail="Đề tài không tồn tại")

    await db.delete(thesis)
    await db.commit()
    return {"status": "deleted", "id": thesis_id}

# FSM State Transitions (UC 3.6, 3.7, 3.8)
@router.post("/{thesis_id}/approve", response_model=ThesisOut)
async def approve_thesis(
    thesis_id: int,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.LECTURER])),
    db: AsyncSession = Depends(get_db),
):
    """FSM State Transition: PENDING -> ONGOING"""
    result = await db.execute(select(Thesis).where(Thesis.id == thesis_id))
    thesis = result.scalar_one_or_none()
    if not thesis:
        raise HTTPException(status_code=404, detail="Đề tài không tồn tại")

    thesis.status = ThesisStatus.ONGOING
    await db.commit()
    await db.refresh(thesis)
    return thesis

@router.post("/{thesis_id}/reject", response_model=ThesisOut)
async def reject_thesis(
    thesis_id: int,
    reject_in: ThesisRejectRequest,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.LECTURER])),
    db: AsyncSession = Depends(get_db),
):
    """FSM State Transition: PENDING -> REJECTED with mandatory reason"""
    result = await db.execute(select(Thesis).where(Thesis.id == thesis_id))
    thesis = result.scalar_one_or_none()
    if not thesis:
        raise HTTPException(status_code=404, detail="Đề tài không tồn tại")

    thesis.status = ThesisStatus.REJECTED
    thesis.rejection_reason = sanitize_input(reject_in.reason)
    await db.commit()
    await db.refresh(thesis)
    return thesis
