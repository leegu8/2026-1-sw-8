from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from ..schemas import (
    UserCreate, UserResponse,
    CalibrationCreate, CalibrationResponse,
    TextContentCreate, TextContentResponse,
    ReadingSessionCreate, ReadingSessionUpdate, ReadingSessionResponse,
    GazeEventCreate, GazeEventBulkCreate, GazeEventResponse,
    ReadingMetricCreate, ReadingMetricResponse,
    InterventionCreate, InterventionResponse,
    SessionReportCreate, SessionReportResponse,
)
from ...domain.database.database import get_db
from ...domain.database.models import (
    User, Calibration, TextContent, ReadingSession,
    GazeEvent, ReadingMetric, Intervention, SessionReport,
    ReadingStatus,
)

router = APIRouter(prefix="/api/db", tags=["database"])


# ── Users ─────────────────────────────────────────────────────────────────────

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
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    return user


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없습니다")
    await db.delete(user)
    await db.commit()


@router.get("/users/{user_id}/sessions", response_model=List[ReadingSessionResponse])
async def get_user_sessions(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ReadingSession).where(ReadingSession.user_id == user_id)
    )
    return result.scalars().all()


@router.get("/users/{user_id}/calibrations", response_model=List[CalibrationResponse])
async def get_user_calibrations(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Calibration).where(Calibration.user_id == user_id)
    )
    return result.scalars().all()


# ── Calibrations ──────────────────────────────────────────────────────────────

@router.post("/calibrations", response_model=CalibrationResponse, status_code=201)
async def create_calibration(body: CalibrationCreate, db: AsyncSession = Depends(get_db)):
    cal = Calibration(**body.model_dump())
    db.add(cal)
    await db.commit()
    await db.refresh(cal)
    return cal


@router.get("/calibrations/{cal_id}", response_model=CalibrationResponse)
async def get_calibration(cal_id: int, db: AsyncSession = Depends(get_db)):
    cal = await db.get(Calibration, cal_id)
    if not cal:
        raise HTTPException(status_code=404, detail="보정 데이터를 찾을 수 없습니다")
    return cal


# ── Text Contents ─────────────────────────────────────────────────────────────

@router.post("/texts", response_model=TextContentResponse, status_code=201)
async def create_text(body: TextContentCreate, db: AsyncSession = Depends(get_db)):
    text = TextContent(**body.model_dump())
    db.add(text)
    await db.commit()
    await db.refresh(text)
    return text


@router.get("/texts", response_model=List[TextContentResponse])
async def list_texts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TextContent))
    return result.scalars().all()


@router.get("/texts/{text_id}", response_model=TextContentResponse)
async def get_text(text_id: int, db: AsyncSession = Depends(get_db)):
    text = await db.get(TextContent, text_id)
    if not text:
        raise HTTPException(status_code=404, detail="텍스트를 찾을 수 없습니다")
    return text


@router.delete("/texts/{text_id}", status_code=204)
async def delete_text(text_id: int, db: AsyncSession = Depends(get_db)):
    text = await db.get(TextContent, text_id)
    if not text:
        raise HTTPException(status_code=404, detail="텍스트를 찾을 수 없습니다")
    await db.delete(text)
    await db.commit()


# ── Reading Sessions ──────────────────────────────────────────────────────────

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
    session = await db.get(ReadingSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")
    return session


@router.patch("/sessions/{session_id}", response_model=ReadingSessionResponse)
async def update_session(
    session_id: int, body: ReadingSessionUpdate, db: AsyncSession = Depends(get_db)
):
    session = await db.get(ReadingSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(session, field, value)
    await db.commit()
    await db.refresh(session)
    return session


@router.post("/sessions/{session_id}/end", response_model=ReadingSessionResponse)
async def end_session(session_id: int, db: AsyncSession = Depends(get_db)):
    session = await db.get(ReadingSession, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="세션을 찾을 수 없습니다")
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    session.ended_at = now
    session.status = ReadingStatus.COMPLETED
    if session.started_at:
        delta_ms = int((now - session.started_at).total_seconds() * 1000)
        session.total_duration_ms = delta_ms
    await db.commit()
    await db.refresh(session)
    return session


# ── Gaze Events ───────────────────────────────────────────────────────────────

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
    for ev in events:
        await db.refresh(ev)
    return events


@router.get("/sessions/{session_id}/events", response_model=List[GazeEventResponse])
async def get_events_by_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GazeEvent).where(GazeEvent.session_id == session_id)
    )
    return result.scalars().all()


# ── Reading Metrics ───────────────────────────────────────────────────────────

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


# ── Interventions ─────────────────────────────────────────────────────────────

@router.post("/interventions", response_model=InterventionResponse, status_code=201)
async def create_intervention(body: InterventionCreate, db: AsyncSession = Depends(get_db)):
    intervention = Intervention(**body.model_dump())
    db.add(intervention)
    await db.commit()
    await db.refresh(intervention)
    return intervention


@router.get("/sessions/{session_id}/interventions", response_model=List[InterventionResponse])
async def get_interventions_by_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Intervention).where(Intervention.session_id == session_id)
    )
    return result.scalars().all()


@router.patch("/interventions/{intervention_id}/accept", response_model=InterventionResponse)
async def accept_intervention(intervention_id: int, db: AsyncSession = Depends(get_db)):
    intervention = await db.get(Intervention, intervention_id)
    if not intervention:
        raise HTTPException(status_code=404, detail="개입을 찾을 수 없습니다")
    intervention.accepted = True
    await db.commit()
    await db.refresh(intervention)
    return intervention


# ── Session Reports ───────────────────────────────────────────────────────────

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
