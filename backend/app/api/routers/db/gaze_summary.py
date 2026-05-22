from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...schemas import GazeSummaryCreate, GazeSummaryBulkCreate, GazeSummaryResponse
from ....db.session import get_db
from ....db.models import GazeSummary

router = APIRouter()


@router.post("/gaze-summary", response_model=GazeSummaryResponse, status_code=201)
async def create_gaze_summary(body: GazeSummaryCreate, db: AsyncSession = Depends(get_db)):
    entry = GazeSummary(**body.model_dump())
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.post("/gaze-summary/bulk", response_model=List[GazeSummaryResponse], status_code=201)
async def bulk_create_gaze_summary(body: GazeSummaryBulkCreate, db: AsyncSession = Depends(get_db)):
    entries = [GazeSummary(**s.model_dump()) for s in body.summaries]
    db.add_all(entries)
    await db.commit()
    for e in entries:
        await db.refresh(e)
    return entries


@router.get("/sessions/{session_id}/gaze-summary", response_model=List[GazeSummaryResponse])
async def get_session_gaze_summary(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GazeSummary)
        .where(GazeSummary.session_id == session_id)
        .order_by(GazeSummary.section_index)
    )
    return result.scalars().all()
