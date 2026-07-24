from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Boolean,
    ForeignKey,
    DateTime,
    Enum as SQLEnum,
    Index,
    CheckConstraint,
)
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from pgvector.sqlalchemy import Vector
from app.db.session import Base
import enum

# ==========================================================================
# ENUM DEFINITIONS (Matching ERD Schema)
# ==========================================================================

class UserRole(str, enum.Enum):
    ADMIN = "ADMIN"
    LECTURER = "LECTURER"
    STUDENT = "STUDENT"

class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"

class ThesisStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PENDING = "PENDING"
    ONGOING = "ONGOING"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"

class MilestoneStatus(str, enum.Enum):
    NOT_STARTED = "NOT_STARTED"
    ONGOING = "ONGOING"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    COMPLETED = "COMPLETED"
    REVISION_REQUIRED = "REVISION_REQUIRED"

class AIStatus(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    DONE = "DONE"
    ERROR = "ERROR"

class AIRole(str, enum.Enum):
    USER = "USER"
    ASSISTANT = "ASSISTANT"

class AIRating(str, enum.Enum):
    LIKE = "LIKE"
    DISLIKE = "DISLIKE"

class TargetType(str, enum.Enum):
    MILESTONE = "MILESTONE"
    DOCUMENT = "DOCUMENT"

class GroupRole(str, enum.Enum):
    LEADER = "LEADER"
    MEMBER = "MEMBER"

# ==========================================================================
# DATABASE MODELS (Normalized & Production-Ready)
# ==========================================================================

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(SQLEnum(UserRole), nullable=False, default=UserRole.STUDENT)
    status = Column(SQLEnum(UserStatus), nullable=False, default=UserStatus.ACTIVE)
    avatar_url = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    student = relationship("Student", back_populates="user", uselist=False, cascade="all, delete-orphan")
    lecturer = relationship("Lecturer", back_populates="user", uselist=False, cascade="all, delete-orphan")
    ai_sessions = relationship("AIChatSession", back_populates="user", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    logs = relationship("SystemLog", back_populates="user")


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    student_code = Column(String(50), unique=True, index=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="student")
    thesis_memberships = relationship("ThesisStudent", back_populates="student", cascade="all, delete-orphan")


class Lecturer(Base):
    __tablename__ = "lecturers"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    lecturer_code = Column(String(50), unique=True, index=True, nullable=False)
    department = Column(String(100), nullable=False)
    max_students = Column(Integer, default=5, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="lecturer")
    theses = relationship("Thesis", back_populates="lecturer")


class Thesis(Base):
    __tablename__ = "theses"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), index=True, nullable=False)
    description = Column(Text, nullable=True)
    field = Column(String(100), nullable=False)
    status = Column(SQLEnum(ThesisStatus), default=ThesisStatus.DRAFT, nullable=False)
    lecturer_id = Column(Integer, ForeignKey("lecturers.id", ondelete="SET NULL"), nullable=True)
    rejection_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    lecturer = relationship("Lecturer", back_populates="theses")
    student_memberships = relationship("ThesisStudent", back_populates="thesis", cascade="all, delete-orphan")
    milestones = relationship("Milestone", back_populates="thesis", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="thesis", cascade="all, delete-orphan")
    ai_sessions = relationship("AIChatSession", back_populates="thesis", cascade="all, delete-orphan")


class ThesisStudent(Base):
    __tablename__ = "thesis_students"

    id = Column(Integer, primary_key=True, index=True)
    thesis_id = Column(Integer, ForeignKey("theses.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    role = Column(SQLEnum(GroupRole), default=GroupRole.MEMBER, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    thesis = relationship("Thesis", back_populates="student_memberships")
    student = relationship("Student", back_populates="thesis_memberships")


class Milestone(Base):
    __tablename__ = "milestones"

    id = Column(Integer, primary_key=True, index=True)
    thesis_id = Column(Integer, ForeignKey("theses.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    deadline = Column(DateTime, nullable=False)
    status = Column(SQLEnum(MilestoneStatus), default=MilestoneStatus.NOT_STARTED, nullable=False)
    evidence_file_url = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    thesis = relationship("Thesis", back_populates="milestones")
    feedbacks = relationship("Feedback", back_populates="milestone", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_milestone_thesis_created", "thesis_id", "created_at"),
    )


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    thesis_id = Column(Integer, ForeignKey("theses.id", ondelete="CASCADE"), nullable=False)
    filename = Column(String(255), nullable=False)
    file_path = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    summary_ai = Column(Text, nullable=True)
    status_ai = Column(SQLEnum(AIStatus), default=AIStatus.PENDING, nullable=False)
    tags = Column(ARRAY(String), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    thesis = relationship("Thesis", back_populates="documents")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")
    feedbacks = relationship("Feedback", back_populates="document", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_document_thesis_created", "thesis_id", "created_at"),
    )


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(1536), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    document = relationship("Document", back_populates="chunks")


class AIChatSession(Base):
    __tablename__ = "ai_chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    thesis_id = Column(Integer, ForeignKey("theses.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    thesis = relationship("Thesis", back_populates="ai_sessions")
    user = relationship("User", back_populates="ai_sessions")
    messages = relationship("AIChatMessage", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_ai_session_thesis_created", "thesis_id", "created_at"),
    )


class AIChatMessage(Base):
    __tablename__ = "ai_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("ai_chat_sessions.id", ondelete="CASCADE"), nullable=False)
    role = Column(SQLEnum(AIRole), nullable=False)
    content = Column(Text, nullable=False)
    citations = Column(JSONB, nullable=True)
    rating = Column(SQLEnum(AIRating), nullable=True)
    feedback_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    session = relationship("AIChatSession", back_populates="messages")


class Feedback(Base):
    __tablename__ = "feedbacks"

    id = Column(Integer, primary_key=True, index=True)
    milestone_id = Column(Integer, ForeignKey("milestones.id", ondelete="CASCADE"), nullable=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    parent_id = Column(Integer, ForeignKey("feedbacks.id", ondelete="CASCADE"), nullable=True)
    file_url = Column(String(255), nullable=True)
    is_resolved = Column(Boolean, default=False, nullable=False)
    resolved_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    milestone = relationship("Milestone", back_populates="feedbacks")
    document = relationship("Document", back_populates="feedbacks")

    __table_args__ = (
        CheckConstraint(
            "(milestone_id IS NOT NULL AND document_id IS NULL) OR (milestone_id IS NULL AND document_id IS NOT NULL)",
            name="chk_feedback_target_exclusive"
        ),
    )


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="notifications")


class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(255), nullable=False)
    ip_address = Column(String(45), nullable=True)
    details = Column(JSONB, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="logs")


class SystemConfig(Base):
    __tablename__ = "system_configs"

    id = Column(Integer, primary_key=True, index=True)
    config_key = Column(String(100), unique=True, index=True, nullable=False)
    config_value = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
