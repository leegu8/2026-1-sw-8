from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...schemas import UserCreate, UserResponse, ReadingSessionResponse
from ....db.session import get_db, get_or_404
from ....db.models import User, ReadingSession

router = APIRouter()


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(body: UserCreate, db: AsyncSession = Depends(get_db)):
    user = User(**body.model_dump())
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/users", response_model=List[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    return result.scalars().all()


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: AsyncSession = Depends(get_db)):
    return await get_or_404(db, User, user_id, "사용자를 찾을 수 없습니다")


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await get_or_404(db, User, user_id, "사용자를 찾을 수 없습니다")
    await db.delete(user)
    await db.commit()


@router.get("/users/{user_id}/sessions", response_model=List[ReadingSessionResponse])
async def get_user_sessions(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ReadingSession).where(ReadingSession.user_id == user_id))
    return result.scalars().all()
