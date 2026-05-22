from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...schemas import CorrectionEventCreate, CorrectionEventResponse
from ....db.session import get_db
from ....db.models import CorrectionEvent

router = APIRouter()


@router.post("/correction-events", response_model=CorrectionEventResponse, status_code=201)
async def create_correction_event(body: CorrectionEventCreate, db: AsyncSession = Depends(get_db)):
    event = CorrectionEvent(**body.model_dump())
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.get("/sessions/{session_id}/correction-events", response_model=List[CorrectionEventResponse])
async def get_session_correction_events(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CorrectionEvent).where(CorrectionEvent.session_id == session_id)
    )
    return result.scalars().all()
