from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from ...schemas import ReadingSessionCreate, ReadingSessionUpdate, ReadingSessionResponse
from ....db.session import get_db, get_or_404
from ....db.models import ReadingSession

router = APIRouter()


@router.post("/sessions", response_model=ReadingSessionResponse, status_code=201)
async def create_session(body: ReadingSessionCreate, db: AsyncSession = Depends(get_db)):
    data = body.model_dump()
    if data.get("started_at") is None:
        data["started_at"] = datetime.now(timezone.utc).replace(tzinfo=None)
    session = ReadingSession(**data)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session



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


