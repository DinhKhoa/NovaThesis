from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.schemas.schemas import MilestoneCreate, MilestoneUpdate, MilestoneOut
from app.core.security import sanitize_input
from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.db.models import Milestone, MilestoneStatus, User, UserRole

router = APIRouter(prefix="/milestones", tags=["Milestones & Progress"])

@router.get("", response_model=List[MilestoneOut])
async def list_milestones(
    thesis_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    query = select(Milestone)
    if thesis_id:
        query = query.where(Milestone.thesis_id == thesis_id)

    query = query.order_by(Milestone.deadline.asc())
    result = await db.execute(query)
    return result.scalars().all()

@router.post("", response_model=MilestoneOut, status_code=201)
async def create_milestone(
    milestone_in: MilestoneCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    new_milestone = Milestone(
        thesis_id=milestone_in.thesis_id,
        name=sanitize_input(milestone_in.name),
        description=sanitize_input(milestone_in.description) if milestone_in.description else None,
        deadline=milestone_in.deadline,
        status=MilestoneStatus.NOT_STARTED,
    )
    db.add(new_milestone)
    await db.commit()
    await db.refresh(new_milestone)
    return new_milestone

@router.patch("/{milestone_id}", response_model=MilestoneOut)
async def update_milestone(
    milestone_id: int,
    milestone_in: MilestoneUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Milestone).where(Milestone.id == milestone_id))
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone không tồn tại")

    if milestone_in.name is not None:
        milestone.name = sanitize_input(milestone_in.name)
    if milestone_in.description is not None:
        milestone.description = sanitize_input(milestone_in.description)
    if milestone_in.deadline is not None:
        milestone.deadline = milestone_in.deadline
    if milestone_in.status is not None:
        milestone.status = milestone_in.status
    if milestone_in.evidence_file_url is not None:
        milestone.evidence_file_url = milestone_in.evidence_file_url

    await db.commit()
    await db.refresh(milestone)
    return milestone

@router.post("/{milestone_id}/approve", response_model=MilestoneOut)
async def approve_milestone(
    milestone_id: int,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.LECTURER])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Milestone).where(Milestone.id == milestone_id))
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone không tồn tại")

    milestone.status = MilestoneStatus.COMPLETED
    await db.commit()
    await db.refresh(milestone)
    return milestone

@router.delete("/{milestone_id}")
async def delete_milestone(
    milestone_id: int,
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.LECTURER])),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Milestone).where(Milestone.id == milestone_id))
    milestone = result.scalar_one_or_none()
    if not milestone:
        raise HTTPException(status_code=404, detail="Milestone không tồn tại")

    await db.delete(milestone)
    await db.commit()
    return {"status": "deleted", "id": milestone_id}
