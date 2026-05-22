from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...schemas import ReadingSessionCreate, ReadingSessionUpdate, ReadingSessionResponse
from ....db.session import get_db, get_or_404
from ....db.models import ReadingSession

router = APIRouter()


@router.post("/sessions", response_model=ReadingSessionResponse, status_code=201)
async def create_session(body: ReadingSessionCreate, db: AsyncSession = Depends(get_db)):
    session = ReadingSession(**body.model_dump())
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


@router.get("/sessions", response_model=List[ReadingSessionResponse])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(ReadingSession))
    return result.scalars().all()


@router.get("/sessions/{session_id}", response_model=ReadingSessionResponse)
async def get_session(session_id: int, db: AsyncSession = Depends(get_db)):
    return await get_or_404(db, ReadingSession, session_id, "세션을 찾을 수 없습니다")


@router.patch("/sessions/{session_id}", response_model=ReadingSessionResponse)
async def update_session(
    session_id: int, body: ReadingSessionUpdate, db: AsyncSession = Depends(get_db)
):
    session = await get_or_404(db, ReadingSession, session_id, "세션을 찾을 수 없습니다")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(session, field, value)
    await db.commit()
    await db.refresh(session)
    return session


@router.post("/sessions/{session_id}/end", response_model=ReadingSessionResponse)
async def end_session(session_id: int, db: AsyncSession = Depends(get_db)):
    session = await get_or_404(db, ReadingSession, session_id, "세션을 찾을 수 없습니다")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    session.ended_at = now
    if session.started_at:
        session.total_duration_sec = int((now - session.started_at).total_seconds())
    await db.commit()
    await db.refresh(session)
    return session
