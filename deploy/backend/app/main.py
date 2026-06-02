import json
import bcrypt
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sqlalchemy import select, text

from .db.session import init_db, async_session, engine
from .db.models import Book, User, LevelHistory, ReadingSession, Attendance
from .api.routers import database, auth

from datetime import datetime, date

_ROOT           = Path(__file__).parent.parent.parent
_FRONTEND       = _ROOT / "frontend"
_BOOKS_JSON     = Path(__file__).parent / "data" / "books.json"
_SESSIONS_JSON  = Path(__file__).parent / "data" / "sessions_seed.json"


async def _seed_admin():
    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == 100))
        if result.scalar_one_or_none():
            return
        password_hash = bcrypt.hashpw("admin1234".encode(), bcrypt.gensalt()).decode()
        db.add(User(id=100, email="admin@admin.com", password_hash=password_hash, nickname="개발자"))
        await db.flush()
        db.add(LevelHistory(user_id=100, level_result="고등"))
        await db.commit()


async def _seed_guest():
    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == 101))
        if result.scalar_one_or_none():
            return
        password_hash = bcrypt.hashpw("guest1234".encode(), bcrypt.gensalt()).decode()
        db.add(User(id=101, email="guest@temp.com", password_hash=password_hash, nickname="게스트"))
        await db.flush()
        db.add(LevelHistory(user_id=101, level_result="중등"))
        await db.commit()


async def _seed_sessions():
    async with async_session() as db:
        result = await db.execute(
            select(ReadingSession).where(ReadingSession.user_id == 100).limit(1)
        )
        if result.scalar_one_or_none():
            return
        sessions_data = json.loads(_SESSIONS_JSON.read_text(encoding="utf-8"))
        for s in sessions_data:
            book_result = await db.execute(select(Book).where(Book.title == s["book_title"]))
            book = book_result.scalar_one_or_none()
            if not book:
                continue
            db.add(ReadingSession(
                user_id            = 100,
                book_id            = book.id,
                started_at         = datetime.fromisoformat(s["started_at"]),
                ended_at           = datetime.fromisoformat(s["ended_at"]),
                total_duration_sec = s["total_duration_sec"],
                wpm                = s["wpm"],
                concentration_score= s["concentration_score"],
                regression_ratio   = s["regression_ratio"],
                visited_lines      = s["visited_lines"],
                total_lines        = s["total_lines"],
                word_count         = s["word_count"],
                score              = s.get("score"),
            ))
        for s in sessions_data:
            d = date.fromisoformat(s["started_at"][:10])
            existing = await db.execute(
                select(Attendance).where(
                    Attendance.user_id == 100,
                    Attendance.attended_at == d,
                )
            )
            if not existing.scalar_one_or_none():
                db.add(Attendance(user_id=100, attended_at=d))
        await db.commit()


async def _seed_books():
    async with async_session() as db:
        result = await db.execute(select(Book).limit(1))
        if result.scalar():
            return
        books_data = json.loads(_BOOKS_JSON.read_text(encoding="utf-8"))
        for b in books_data:
            db.add(Book(
                title      = b["title"],
                content    = b["content"],
                difficulty = b.get("difficulty"),
                genre      = b.get("genre"),
            ))
        await db.commit()


async def _reset_sequences():
    """PostgreSQL 시퀀스를 seed 데이터의 max ID 이후로 초기화."""
    from .core.config import DATABASE_URL
    if "postgresql" not in DATABASE_URL:
        return
    async with engine.begin() as conn:
        for table, col in [
            ("users", "users_id_seq"),
            ("level_history", "level_history_id_seq"),
            ("attendance", "attendance_id_seq"),
            ("books", "books_id_seq"),
            ("reading_sessions", "reading_sessions_id_seq"),
            ("correction_events", "correction_events_id_seq"),
        ]:
            await conn.execute(
                text(f"SELECT setval('{col}', COALESCE((SELECT MAX(id) FROM {table}), 1))")
            )


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _seed_admin()
    await _seed_guest()
    await _seed_books()
    await _seed_sessions()
    await _reset_sequences()
    yield


app = FastAPI(lifespan=lifespan)

app.mount("/static", StaticFiles(directory=str(_FRONTEND / "static")), name="static")

app.include_router(database)
app.include_router(auth)

_NO_CACHE = {"Cache-Control": "no-store"}


@app.get("/")
async def root():
    return FileResponse(str(_FRONTEND / "pages" / "index.html"), headers=_NO_CACHE)


@app.get("/{page}.html")
async def serve_page(page: str):
    path = _FRONTEND / "pages" / f"{page}.html"
    if path.exists():
        return FileResponse(str(path), headers=_NO_CACHE)
    return FileResponse(str(_FRONTEND / "pages" / "index.html"), headers=_NO_CACHE)
