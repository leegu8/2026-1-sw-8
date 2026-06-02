from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ....db.session import get_db, get_or_404
from ....db.models import ReadingSession, CorrectionEvent, Book

router = APIRouter()


@router.get("/sessions/{session_id}/result")
async def get_session_result(session_id: int, db: AsyncSession = Depends(get_db)):
    session = await get_or_404(db, ReadingSession, session_id, "세션을 찾을 수 없습니다")
    book = await db.get(Book, session.book_id)

    events_result = await db.execute(
        select(CorrectionEvent)
        .where(CorrectionEvent.session_id == session_id)
        .order_by(CorrectionEvent.triggered_at)
    )
    events = events_result.scalars().all()

    blur_count      = sum(1 for e in events if e.event_type == "BLUR")
    highlight_count = sum(1 for e in events if e.event_type == "HIGHLIGHT")

    total_lines = session.total_lines or 1
    visited_lines = session.visited_lines or 0
    completion_rate = round(visited_lines / total_lines, 4) if total_lines > 0 else 0.0

    return {
        "session_id": session.id,
        "book_title": book.title if book else "",
        "total_duration_sec": session.total_duration_sec,
        "word_count": session.word_count,
        "visited_lines": visited_lines,
        "total_lines": total_lines,
        "correction_events": [
            {
                "event_type": e.event_type,
                "line_index": e.line_index,
                "triggered_at": e.triggered_at.isoformat() if e.triggered_at else None,
            }
            for e in events
        ],
        "summary": {
            "wpm": session.wpm,
            "completion_rate": completion_rate,
            "concentration_score": session.concentration_score,
            "regression_ratio": session.regression_ratio,
            "blur_event_count": blur_count,
            "highlight_event_count": highlight_count,
        },
    }
