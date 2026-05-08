from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...schemas import SessionReportCreate, SessionReportResponse
from ....db.session import get_db
from ....db.models import SessionReport

router = APIRouter()


@router.post("/reports", response_model=SessionReportResponse, status_code=201)
async def create_report(body: SessionReportCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(SessionReport).where(SessionReport.session_id == body.session_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="해당 세션의 리포트가 이미 존재합니다")
    report = SessionReport(**body.model_dump())
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report


@router.get("/sessions/{session_id}/report", response_model=SessionReportResponse)
async def get_report_by_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(SessionReport).where(SessionReport.session_id == session_id)
    )
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="리포트를 찾을 수 없습니다")
    return report
