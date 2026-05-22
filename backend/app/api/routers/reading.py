from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ...db.session import get_db, get_or_404
from ...db.models import ReadingSession, CorrectionEvent, GazeSummary, Book

router = APIRouter(prefix="/api/reading", tags=["reading"])

_FIXATION_THRESHOLD_MS = 400
_MOVEMENT_PX = 10
_OOB_MARGIN = 20
_SIGN_THRESHOLD_PX = 5
_MIN_SEGMENT_COVERAGE = 4  # 5개 중 4개 이상 = 80%


# ── 요청 스키마 ────────────────────────────────────────────────────────────────

class ReadingLogItem(BaseModel):
    timestamp_ms: int
    line_index: Optional[int] = None
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
    ended_at: Optional[datetime] = None
    reading_logs: List[ReadingLogItem] = []
    correction_events: List[CorrectionEventItem] = []


# ── 분석 함수 ──────────────────────────────────────────────────────────────────

def _compute_visited_lines(logs: List[ReadingLogItem], x_min: float, x_max: float) -> List[int]:
    """세그먼트 기반 완독 판정 — 5등분 중 4구간 이상 통과한 줄만 방문으로 간주."""
    segment_width = (x_max - x_min) / 5
    line_segments: dict[int, set] = defaultdict(set)

    for log in logs:
        if log.line_index is None:
            continue
        seg = int((log.x - x_min) / segment_width)
        seg = max(0, min(4, seg))
        line_segments[log.line_index].add(seg)

    return [
        line for line, segs in line_segments.items()
        if len(segs) >= _MIN_SEGMENT_COVERAGE
    ]


def _compute_non_concentrated_ms(logs: List[ReadingLogItem], x_min: float, x_max: float) -> int:
    """집중 못한 시간(ms) 계산 — 3가지 케이스 합산, 중복 제거."""
    if not logs:
        return 0

    non_conc = [False] * len(logs)

    # 케이스 1: 텍스트 영역 이탈 또는 줄 감지 불가
    for i, log in enumerate(logs):
        if log.line_index is None or log.x < x_min - _OOB_MARGIN or log.x > x_max + _OOB_MARGIN:
            non_conc[i] = True

    # 케이스 2: 고정 시선 400ms 이상 (fixation)
    still_start = 0
    for i in range(1, len(logs)):
        moved = abs(logs[i].x - logs[still_start].x) > _MOVEMENT_PX
        if moved:
            fixation_ms = logs[i - 1].timestamp_ms - logs[still_start].timestamp_ms
            if fixation_ms >= _FIXATION_THRESHOLD_MS:
                for k in range(still_start, i):
                    non_conc[k] = True
            still_start = i
    # 마지막 구간
    fixation_ms = logs[-1].timestamp_ms - logs[still_start].timestamp_ms
    if fixation_ms >= _FIXATION_THRESHOLD_MS:
        for k in range(still_start, len(logs)):
            non_conc[k] = True

    # 케이스 3: 줄 변화 + 최근 5점 Δx 부호 반전 2회 이상 (비독서 패턴)
    for i in range(4, len(logs)):
        window = logs[i - 4: i + 1]
        deltas = [window[k + 1].x - window[k].x for k in range(4)]
        signs = [
            1 if d > _SIGN_THRESHOLD_PX else (-1 if d < -_SIGN_THRESHOLD_PX else 0)
            for d in deltas
        ]
        reversals = sum(
            1 for k in range(3)
            if signs[k] != 0 and signs[k + 1] != 0 and signs[k] != signs[k + 1]
        )
        line_changed = any(
            window[k].line_index is not None
            and window[k + 1].line_index is not None
            and window[k].line_index != window[k + 1].line_index
            for k in range(4)
        )
        if reversals >= 2 and line_changed:
            non_conc[i] = True

    # 중복 없이 시간 합산 (각 포인트의 duration = 다음 포인트까지의 간격)
    total_ms = 0
    for i, is_non_conc in enumerate(non_conc):
        if is_non_conc:
            duration = (logs[i + 1].timestamp_ms - logs[i].timestamp_ms) if i + 1 < len(logs) else 100
            total_ms += max(0, duration)
    return total_ms


def _compute_regression_count(logs: List[ReadingLogItem]) -> int:
    """역행 카운트 — 줄 감소 또는 같은 줄에서 x 급격한 좌이동."""
    count = 0
    for i in range(1, len(logs)):
        prev, cur = logs[i - 1], logs[i]
        if cur.line_index is not None and prev.line_index is not None:
            if cur.line_index < prev.line_index:
                count += 1
            elif cur.line_index == prev.line_index and cur.x < prev.x - 30:
                count += 1
    return count


def _build_gaze_summary(
    session_id: int,
    section_index: int,
    logs: List[ReadingLogItem],
    x_min: Optional[float],
    x_max: Optional[float],
) -> Optional[GazeSummary]:
    if not logs:
        return None

    line_indices = [log.line_index for log in logs if log.line_index is not None]
    x_values = [log.x for log in logs]
    timestamps = [log.timestamp_ms for log in logs]

    regression_count = _compute_regression_count(logs)
    total_movements = len(logs) - 1
    focus_rate = max(0.0, 1.0 - regression_count / total_movements) if total_movements > 0 else 1.0

    speeds = [
        abs(x_values[i] - x_values[i - 1]) / (timestamps[i] - timestamps[i - 1])
        for i in range(1, len(logs))
        if timestamps[i] - timestamps[i - 1] > 0
    ]
    avg_gaze_speed = round(sum(speeds) / len(speeds), 6) if speeds else 0.0

    visited = _compute_visited_lines(logs, x_min, x_max) if x_min is not None and x_max is not None else []
    non_conc_ms = _compute_non_concentrated_ms(logs, x_min, x_max) if x_min is not None and x_max is not None else 0

    return GazeSummary(
        session_id=session_id,
        section_index=section_index,
        section_start_sec=(section_index - 1) * 10,
        section_end_sec=section_index * 10,
        section_start_line=min(line_indices) if line_indices else None,
        section_end_line=max(line_indices) if line_indices else None,
        focus_rate=round(focus_rate, 4),
        regression_count=regression_count,
        avg_gaze_speed=avg_gaze_speed,
        non_concentrated_ms=non_conc_ms,
        visited_line_indices=visited,
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


# ── 엔드포인트 ─────────────────────────────────────────────────────────────────

@router.post("/log")
async def reading_log(body: ReadingLogRequest, db: AsyncSession = Depends(get_db)):
    session = await get_or_404(db, ReadingSession, body.session_id, "세션을 찾을 수 없습니다")
    section_index = await _next_section_index(db, body.session_id)

    summary = _build_gaze_summary(body.session_id, section_index, body.reading_logs, session.x_min, session.x_max)
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
        summary = _build_gaze_summary(body.session_id, section_index, body.reading_logs, session.x_min, session.x_max)
        if summary:
            db.add(summary)
    await _save_correction_events(db, session, section_index, body.correction_events)
    await db.flush()

    # 전체 gaze_summary 집계
    result = await db.execute(
        select(GazeSummary)
        .where(GazeSummary.session_id == body.session_id)
        .order_by(GazeSummary.section_index)
    )
    summaries = result.scalars().all()

    now = body.ended_at or datetime.now(timezone.utc).replace(tzinfo=None)
    total_duration_sec = max(int((now - session.started_at).total_seconds()), 1)

    if summaries:
        # 완독률: 전 구간 visited_line_indices 합집합
        all_visited: set[int] = set()
        for s in summaries:
            if s.visited_line_indices:
                all_visited.update(s.visited_line_indices)
        visited_lines = len(all_visited)

        # 집중도: 전 구간 비집중 시간 합산
        total_non_conc_ms = sum(s.non_concentrated_ms or 0 for s in summaries)
        total_ms = total_duration_sec * 1000
        concentration_score = max(0.0, (total_ms - total_non_conc_ms) / total_ms * 100)

        # 역행 비율: regPerMin = (역행 횟수 × 0.1초) / 독서시간(분)
        total_regressions = sum(s.regression_count for s in summaries)
        regression_ratio = (total_regressions * 0.1) / (total_duration_sec / 60)

        base_vel = summaries[0].avg_gaze_speed or 0.0
        end_vel = summaries[-1].avg_gaze_speed or 0.0
    else:
        visited_lines = concentration_score = regression_ratio = base_vel = end_vel = 0.0

    # WPM
    book = await db.get(Book, session.book_id)
    total_lines = session.total_lines or 1
    if book and total_lines > 0 and visited_lines > 0:
        total_words = len(book.content.split())
        wpm = (total_words / total_duration_sec) * 60
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
