from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ....db.session import get_db
from ....db.models import ReadingSession, CorrectionEvent, Book, Attendance

router = APIRouter()


@router.get("/users/{user_id}/growth")
async def get_growth(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ReadingSession)
        .where(
            ReadingSession.user_id == user_id,
            ReadingSession.ended_at.isnot(None),
        )
        .order_by(ReadingSession.started_at.desc())
        .limit(5)
    )
    sessions = sorted(result.scalars().all(), key=lambda s: s.started_at)

    growth_data = []
    for session in sessions:
        book = await db.get(Book, session.book_id)

        blur_result = await db.execute(
            select(func.count(CorrectionEvent.id)).where(
                CorrectionEvent.session_id == session.id,
                CorrectionEvent.event_type == "BLUR",
            )
        )
        highlight_result = await db.execute(
            select(func.count(CorrectionEvent.id)).where(
                CorrectionEvent.session_id == session.id,
                CorrectionEvent.event_type == "HIGHLIGHT",
            )
        )

        total_lines = session.total_lines or 1
        visited_lines = session.visited_lines or 0
        completion_rate = round(visited_lines / total_lines, 4) if total_lines > 0 else 0.0

        growth_data.append({
            "session_id": session.id,
            "book_title": book.title if book else "",
            "started_at": session.started_at.date().isoformat(),
            "total_duration_sec": session.total_duration_sec,
            "score": session.score,
            "summary": {
                "wpm": session.wpm,
                "completion_rate": completion_rate,
                "concentration_score": session.concentration_score,
                "regression_ratio": session.regression_ratio,
                "blur_event_count": blur_result.scalar(),
                "highlight_event_count": highlight_result.scalar(),
            },
        })

    return growth_data


@router.get("/users/{user_id}/attendance/streak")
async def get_attendance_streak(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Attendance.attended_at)
        .where(Attendance.user_id == user_id)
        .order_by(Attendance.attended_at.desc())
    )
    all_dates = sorted({row[0] for row in result.all()}, reverse=True)

    today = date.today()
    streak = 0
    check = today
    for d in all_dates:
        if d == check:
            streak += 1
            check -= timedelta(days=1)
        elif d < check:
            break

    week_ago = today - timedelta(days=6)
    recent_dates = sorted(d.isoformat() for d in all_dates if d >= week_ago)

    return {
        "streak": streak,
        "total_days": len(all_dates),
        "recent_dates": recent_dates,
    }
