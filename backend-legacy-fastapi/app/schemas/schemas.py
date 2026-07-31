from datetime import datetime
from typing import Optional, List, Any, Generic, TypeVar
from pydantic import BaseModel, EmailStr, Field
from app.db.models import (
    UserRole,
    UserStatus,
    ThesisStatus,
    MilestoneStatus,
    AIStatus,
    AIRole,
    AIRating,
    GroupRole,
)

T = TypeVar("T")

# ==========================================================================
# PAGINATION SCHEMAS
# ==========================================================================

class PaginationParams(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int

# ==========================================================================
# USER SCHEMAS
# ==========================================================================

class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=255)
    role: UserRole = UserRole.STUDENT

class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    student_code: Optional[str] = None
    lecturer_code: Optional[str] = None
    department: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=255)
    avatar_url: Optional[str] = None
    student_code: Optional[str] = None
    lecturer_code: Optional[str] = None
    department: Optional[str] = None

class UserOut(UserBase):
    id: int
    status: UserStatus
    avatar_url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut

# ==========================================================================
# THESIS SCHEMAS
# ==========================================================================

class ThesisBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    description: Optional[str] = None
    field: str = Field(..., max_length=100)

class ThesisCreate(ThesisBase):
    lecturer_id: Optional[int] = None

class ThesisUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=255)
    description: Optional[str] = None
    field: Optional[str] = Field(None, max_length=100)
    lecturer_id: Optional[int] = None
    status: Optional[ThesisStatus] = None

class ThesisRejectRequest(BaseModel):
    reason: str = Field(..., min_length=3)

class ThesisOut(ThesisBase):
    id: int
    status: ThesisStatus
    lecturer_id: Optional[int] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ==========================================================================
# MILESTONE SCHEMAS
# ==========================================================================

class MilestoneBase(BaseModel):
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    deadline: datetime

class MilestoneCreate(MilestoneBase):
    thesis_id: int

class MilestoneUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    deadline: Optional[datetime] = None
    status: Optional[MilestoneStatus] = None
    evidence_file_url: Optional[str] = None

class MilestoneOut(MilestoneBase):
    id: int
    thesis_id: int
    status: MilestoneStatus
    evidence_file_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ==========================================================================
# DOCUMENT SCHEMAS
# ==========================================================================

class DocumentOut(BaseModel):
    id: int
    thesis_id: int
    filename: str
    file_path: str
    file_size: int
    summary_ai: Optional[str] = None
    status_ai: AIStatus
    tags: Optional[List[str]] = None
    created_at: datetime

    class Config:
        from_attributes = True

# ==========================================================================
# AI CHAT SCHEMAS
# ==========================================================================

class AIChatPrompt(BaseModel):
    session_id: Optional[int] = None
    thesis_id: int
    prompt: str = Field(..., min_length=1)

class AIChatMessageOut(BaseModel):
    id: int
    session_id: int
    role: AIRole
    content: str
    citations: Optional[Any] = None
    rating: Optional[AIRating] = None
    feedback_note: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class AIChatSessionOut(BaseModel):
    id: int
    thesis_id: int
    user_id: int
    title: str
    created_at: datetime

    class Config:
        from_attributes = True

# ==========================================================================
# FEEDBACK SCHEMAS
# ==========================================================================

class FeedbackCreate(BaseModel):
    milestone_id: Optional[int] = None
    document_id: Optional[int] = None
    content: str = Field(..., min_length=1)
    parent_id: Optional[int] = None
    file_url: Optional[str] = None

class FeedbackOut(BaseModel):
    id: int
    milestone_id: Optional[int] = None
    document_id: Optional[int] = None
    user_id: int
    content: str
    parent_id: Optional[int] = None
    file_url: Optional[str] = None
    is_resolved: bool
    resolved_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ==========================================================================
# NOTIFICATION & SYSTEM LOG SCHEMAS
# ==========================================================================

class NotificationOut(BaseModel):
    id: int
    user_id: int
    title: str
    content: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

class SystemLogOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: str
    ip_address: Optional[str] = None
    details: Optional[Any] = None
    created_at: datetime

    class Config:
        from_attributes = True

Token.model_rebuild()
