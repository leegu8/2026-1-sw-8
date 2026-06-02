from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...schemas import LevelHistoryResponse
from ....db.session import get_db
from ....db.models import LevelHistory

router = APIRouter()


@router.get("/users/{user_id}/level-history", response_model=List[LevelHistoryResponse])
async def get_user_level_history(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LevelHistory).where(LevelHistory.user_id == user_id))
    return result.scalars().all()
