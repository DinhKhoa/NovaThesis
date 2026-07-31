from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.security import verify_password, get_password_hash, create_access_token, sanitize_input
from app.core.deps import get_current_user
from app.db.session import get_db
from app.db.models import User, Student, Lecturer, UserRole, UserStatus
from app.schemas.schemas import UserCreate, UserLogin, Token, UserOut, ProfileUpdate

router = APIRouter(prefix="/auth", tags=["Auth"])

@router.post("/login", response_model=Token)
async def login(
    credentials: UserLogin,
    db: AsyncSession = Depends(get_db),
):
    email = credentials.email.lower().strip()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không chính xác",
        )

    if user.status == UserStatus.SUSPENDED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản của bạn đã bị khóa. Vui lòng liên hệ Admin.",
        )

    token = create_access_token(subject=user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user,
    }

@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    email = user_in.email.lower().strip()
    result = await db.execute(select(User).where(User.email == email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email này đã được sử dụng",
        )

    new_user = User(
        email=email,
        password_hash=get_password_hash(user_in.password),
        full_name=sanitize_input(user_in.full_name),
        role=user_in.role,
        status=UserStatus.ACTIVE,
    )
    db.add(new_user)
    await db.flush()  # Obtain new_user.id

    if user_in.role == UserRole.STUDENT:
        student_profile = Student(
            user_id=new_user.id,
            student_code=sanitize_input(user_in.student_code) if user_in.student_code else None,
        )
        db.add(student_profile)
    elif user_in.role == UserRole.LECTURER:
        lecturer_profile = Lecturer(
            user_id=new_user.id,
            lecturer_code=sanitize_input(user_in.lecturer_code) if user_in.lecturer_code else f"LEC_{new_user.id}",
            department=sanitize_input(user_in.department) if user_in.department else "Công nghệ Thông tin",
        )
        db.add(lecturer_profile)

    await db.commit()
    await db.refresh(new_user)
    return new_user

@router.get("/me", response_model=UserOut)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.patch("/profile", response_model=UserOut)
async def update_profile(
    profile_in: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if profile_in.full_name is not None:
        current_user.full_name = sanitize_input(profile_in.full_name)
    if profile_in.avatar_url is not None:
        current_user.avatar_url = profile_in.avatar_url

    await db.commit()
    await db.refresh(current_user)
    return current_user
