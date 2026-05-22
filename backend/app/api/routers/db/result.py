from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ....db.session import get_db, get_or_404
from ....db.models import ReadingSession, CorrectionEvent, Book

router = APIRouter()


@router.get("/sessions/{session_id}/result")
async def get_session_result(session_id: int, db: AsyncSession = Depends(get_db)):
    session = await get_or_404(db, ReadingSession, session_id, "세션을 찾을 수 없습니다")
    book = await db.get(Book, session.book_id)

    blur_result = await db.execute(
        select(func.count(CorrectionEvent.id)).where(
            CorrectionEvent.session_id == session_id,
            CorrectionEvent.event_type == "BLUR",
        )
    )
    highlight_result = await db.execute(
        select(func.count(CorrectionEvent.id)).where(
            CorrectionEvent.session_id == session_id,
            CorrectionEvent.event_type == "HIGHLIGHT",
        )
    )

    total_lines = session.total_lines or 1
    visited_lines = session.visited_lines or 0
    completion_rate = round(visited_lines / total_lines, 4) if total_lines > 0 else 0.0

    return {
        "session_id": session.id,
        "book_title": book.title if book else "",
        "total_duration_sec": session.total_duration_sec,
        "summary": {
            "wpm": session.wpm,
            "completion_rate": completion_rate,
            "concentration_score": session.concentration_score,
            "regression_ratio": session.regression_ratio,
            "blur_event_count": blur_result.scalar(),
            "highlight_event_count": highlight_result.scalar(),
        },
    }
