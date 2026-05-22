import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ..schemas import RegisterRequest, LoginRequest, AuthResponse
from ...db.session import get_db
from ...db.models import User, LevelHistory

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _hash(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _verify(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


async def _latest_level(db: AsyncSession, user_id: int) -> str | None:
    result = await db.execute(
        select(LevelHistory)
        .where(LevelHistory.user_id == user_id)
        .order_by(LevelHistory.tested_at.desc())
        .limit(1)
    )
    entry = result.scalar_one_or_none()
    return entry.level_result if entry else None


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="이미 사용 중인 이메일입니다")
    user = User(
        email=body.email,
        password_hash=_hash(body.password),
        nickname=body.nickname,
    )
    db.add(user)
    await db.flush()
    db.add(LevelHistory(user_id=user.id, level_result=body.level))
    await db.commit()
    await db.refresh(user)
    return AuthResponse(id=user.id, email=user.email, nickname=user.nickname, level=body.level)


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not _verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다")
    level = await _latest_level(db, user.id)
    return AuthResponse(id=user.id, email=user.email, nickname=user.nickname, level=level)
