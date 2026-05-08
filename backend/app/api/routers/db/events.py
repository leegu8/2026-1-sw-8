from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...schemas import GazeEventCreate, GazeEventBulkCreate, GazeEventResponse
from ....db.session import get_db
from ....db.models import GazeEvent

router = APIRouter()


@router.post("/events", response_model=GazeEventResponse, status_code=201)
async def create_event(body: GazeEventCreate, db: AsyncSession = Depends(get_db)):
    event = GazeEvent(**body.model_dump())
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.post("/events/bulk", response_model=List[GazeEventResponse], status_code=201)
async def create_events_bulk(body: GazeEventBulkCreate, db: AsyncSession = Depends(get_db)):
    events = [GazeEvent(**e.model_dump()) for e in body.events]
    db.add_all(events)
    await db.commit()
    return events  # expire_on_commit=False로 인해 refresh 불필요


@router.get("/sessions/{session_id}/events", response_model=List[GazeEventResponse])
async def get_events_by_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(GazeEvent).where(GazeEvent.session_id == session_id))
    return result.scalars().all()
