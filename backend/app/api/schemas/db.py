from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel, ConfigDict


# ── Auth ───────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    password: str
    nickname: str
    level: str


class LoginRequest(BaseModel):
    email: str
    password: str


class AuthResponse(BaseModel):
    id: int
    email: str
    nickname: str
    level: Optional[str] = None


# ── LevelHistory ──────────────────────────────────────────────────────────────

class LevelHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    level_result: Optional[str]
    tested_at: datetime


# ── Attendance ────────────────────────────────────────────────────────────────

class AttendanceCreate(BaseModel):
    user_id: int
    attended_at: Optional[date] = None


class AttendanceCheckResponse(BaseModel):
    checked: bool


# ── Book ──────────────────────────────────────────────────────────────────────

class BookCreate(BaseModel):
    title: str
    content: str
    difficulty: Optional[str] = None
    genre: Optional[str] = None


class BookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    content: str
    difficulty: Optional[str]
    genre: Optional[str]
    created_at: datetime


class BookListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    difficulty: Optional[str]
    genre: Optional[str]
    created_at: datetime


class CompletedBookItem(BaseModel):
    book_id: int


# ── ReadingSession ────────────────────────────────────────────────────────────

class ReadingSessionCreate(BaseModel):
    user_id: int
    book_id: int
    started_at: Optional[datetime] = None
    total_lines: Optional[int] = None


class ReadingSessionUpdate(BaseModel):
    ended_at: Optional[datetime] = None
    total_duration_sec: Optional[int] = None
    wpm: Optional[float] = None
    concentration_score: Optional[float] = None
    regression_ratio: Optional[float] = None
    visited_lines: Optional[int] = None
    total_lines: Optional[int] = None
    word_count: Optional[int] = None
    score: Optional[float] = None


class ReadingSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    book_id: int
    started_at: datetime
    ended_at: Optional[datetime]
    total_duration_sec: Optional[int]
    wpm: Optional[float]
    concentration_score: Optional[float]
    regression_ratio: Optional[float]
    visited_lines: Optional[int]
    total_lines: Optional[int]
    word_count: Optional[int]
    score: Optional[float]


# ── CorrectionEvent ───────────────────────────────────────────────────────────

class CorrectionEventCreate(BaseModel):
    session_id: int
    event_type: str
    line_index: Optional[int] = None


class CorrectionEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    session_id: int
    event_type: str
    line_index: Optional[int]
    triggered_at: datetime


