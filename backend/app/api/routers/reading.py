from datetime import datetime, timezone, timedelta
from typing import List
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ..schemas import ReadingSessionResponse
from ...db.session import get_db, get_or_404
from ...db.models import ReadingSession, CorrectionEvent, GazeSummary, Book

router = APIRouter(prefix="/api/reading", tags=["reading"])


class ReadingLogItem(BaseModel):
    timestamp_ms: int
    line_index: int
    x: float


class CorrectionEventItem(BaseModel):
    timestamp_ms: int
    event_type: str


class ReadingLogRequest(BaseModel):
    session_id: int
    reading_logs: List[ReadingLogItem]
    correction_events: List[CorrectionEventItem] = []


class ReadingEndRequest(BaseModel):
    session_id: int
    reading_logs: List[ReadingLogItem] = []
    correction_events: List[CorrectionEventItem] = []


def _compute_gaze_summary(
    session_id: int,
    section_index: int,
    logs: List[ReadingLogItem],
) -> GazeSummary | None:
    if not logs:
        return None

    line_indices = [log.line_index for log in logs]
    x_values = [log.x for log in logs]
    timestamps = [log.timestamp_ms for log in logs]

    regression_count = sum(
        1 for i in range(1, len(line_indices))
        if line_indices[i] < line_indices[i - 1]
    )
    total_movements = len(logs) - 1
    focus_rate = max(0.0, 1.0 - regression_count / total_movements) if total_movements > 0 else 1.0

    speeds = [
        abs(x_values[i] - x_values[i - 1]) / (timestamps[i] - timestamps[i - 1])
        for i in range(1, len(logs))
        if timestamps[i] - timestamps[i - 1] > 0
    ]
    avg_gaze_speed = sum(speeds) / len(speeds) if speeds else 0.0

    return GazeSummary(
        session_id=session_id,
        section_index=section_index,
        section_start_sec=(section_index - 1) * 10,
        section_end_sec=section_index * 10,
        section_start_line=min(line_indices),
        section_end_line=max(line_indices),
        focus_rate=round(focus_rate, 4),
        regression_count=regression_count,
        avg_gaze_speed=round(avg_gaze_speed, 6),
    )


async def _next_section_index(db: AsyncSession, session_id: int) -> int:
    result = await db.execute(
        select(func.count(GazeSummary.id)).where(GazeSummary.session_id == session_id)
    )
    return (result.scalar() or 0) + 1


async def _save_correction_events(
    db: AsyncSession,
    session: ReadingSession,
    section_index: int,
    events: List[CorrectionEventItem],
):
    for event in events:
        offset_ms = (section_index - 1) * 10_000 + event.timestamp_ms
        triggered_at = session.started_at + timedelta(milliseconds=offset_ms)
        db.add(CorrectionEvent(
            session_id=session.id,
            event_type=event.event_type,
            triggered_at=triggered_at,
        ))


@router.post("/log")
async def reading_log(body: ReadingLogRequest, db: AsyncSession = Depends(get_db)):
    session = await get_or_404(db, ReadingSession, body.session_id, "세션을 찾을 수 없습니다")
    section_index = await _next_section_index(db, body.session_id)

    summary = _compute_gaze_summary(body.session_id, section_index, body.reading_logs)
    if summary:
        db.add(summary)

    await _save_correction_events(db, session, section_index, body.correction_events)
    await db.commit()
    return {"ok": True}


@router.post("/end")
async def reading_end(body: ReadingEndRequest, db: AsyncSession = Depends(get_db)):
    session = await get_or_404(db, ReadingSession, body.session_id, "세션을 찾을 수 없습니다")
    section_index = await _next_section_index(db, body.session_id)

    # 남은 로그 처리
    if body.reading_logs:
        summary = _compute_gaze_summary(body.session_id, section_index, body.reading_logs)
        if summary:
            db.add(summary)
    await _save_correction_events(db, session, section_index, body.correction_events)
    await db.flush()

    # 전체 gaze_summary 집계
    summaries_result = await db.execute(
        select(GazeSummary)
        .where(GazeSummary.session_id == body.session_id)
        .order_by(GazeSummary.section_index)
    )
    summaries = summaries_result.scalars().all()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    total_duration_sec = max(int((now - session.started_at).total_seconds()), 1)

    if summaries:
        concentration_score = sum(s.focus_rate for s in summaries) / len(summaries) * 100
        total_regressions = sum(s.regression_count for s in summaries)
        regression_ratio = total_regressions / (total_duration_sec * 10)
        visited_lines = max((s.section_end_line or 0) for s in summaries)
        base_vel = summaries[0].avg_gaze_speed or 0.0
        end_vel = summaries[-1].avg_gaze_speed or 0.0
    else:
        concentration_score = regression_ratio = visited_lines = base_vel = end_vel = 0.0

    # WPM 계산
    book = await db.get(Book, session.book_id)
    total_lines = session.total_lines or 1
    if book and total_lines > 0 and visited_lines > 0:
        total_words = len(book.content.split())
        words_read = (visited_lines / total_lines) * total_words
        wpm = words_read / (total_duration_sec / 60)
    else:
        wpm = 0.0

    session.ended_at = now
    session.total_duration_sec = total_duration_sec
    session.concentration_score = round(concentration_score, 2)
    session.regression_ratio = round(regression_ratio, 4)
    session.visited_lines = int(visited_lines)
    session.base_vel = round(base_vel, 4)
    session.end_vel = round(end_vel, 4)
    session.wpm = round(wpm, 2)

    await db.commit()
    return {"session_id": body.session_id}
