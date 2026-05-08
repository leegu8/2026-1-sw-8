from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...schemas import ReadingMetricCreate, ReadingMetricResponse
from ....db.session import get_db
from ....db.models import ReadingMetric

router = APIRouter()


@router.post("/metrics", response_model=ReadingMetricResponse, status_code=201)
async def create_metric(body: ReadingMetricCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(ReadingMetric).where(ReadingMetric.session_id == body.session_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="해당 세션의 지표가 이미 존재합니다")
    metric = ReadingMetric(**body.model_dump())
    db.add(metric)
    await db.commit()
    await db.refresh(metric)
    return metric


@router.get("/sessions/{session_id}/metrics", response_model=ReadingMetricResponse)
async def get_metric_by_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ReadingMetric).where(ReadingMetric.session_id == session_id)
    )
    metric = result.scalar_one_or_none()
    if not metric:
        raise HTTPException(status_code=404, detail="지표를 찾을 수 없습니다")
    return metric
