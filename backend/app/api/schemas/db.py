from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


# ── User ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    password_hash: str
    nickname: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    nickname: str
    created_at: datetime


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

class LevelHistoryCreate(BaseModel):
    user_id: int
    level_result: Optional[str] = None


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


class AttendanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    attended_at: date


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
    total_lines: Optional[int] = None
    x_min: Optional[float] = None
    x_max: Optional[float] = None


class ReadingSessionUpdate(BaseModel):
    ended_at: Optional[datetime] = None
    total_duration_sec: Optional[int] = None
    wpm: Optional[float] = None
    concentration_score: Optional[float] = None
    base_vel: Optional[float] = None
    end_vel: Optional[float] = None
    regression_ratio: Optional[float] = None
    visited_lines: Optional[int] = None
    total_lines: Optional[int] = None


class ReadingSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    book_id: int
    started_at: datetime
    ended_at: Optional[datetime]
    total_duration_sec: Optional[int]
    x_min: Optional[float]
    x_max: Optional[float]
    wpm: Optional[float]
    concentration_score: Optional[float]
    base_vel: Optional[float]
    end_vel: Optional[float]
    regression_ratio: Optional[float]
    visited_lines: Optional[int]
    total_lines: Optional[int]


# ── CorrectionEvent ───────────────────────────────────────────────────────────

class CorrectionEventCreate(BaseModel):
    session_id: int
    event_type: str


class CorrectionEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    session_id: int
    event_type: str
    triggered_at: datetime


# ── GazeSummary ───────────────────────────────────────────────────────────────

class GazeSummaryCreate(BaseModel):
    session_id: int
    section_index: int
    section_start_sec: int
    section_end_sec: int
    section_start_line: Optional[int] = None
    section_end_line: Optional[int] = None
    focus_rate: float
    regression_count: int
    avg_gaze_speed: Optional[float] = None


class GazeSummaryBulkCreate(BaseModel):
    summaries: List[GazeSummaryCreate]


class GazeSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    session_id: int
    section_index: int
    section_start_sec: int
    section_end_sec: int
    section_start_line: Optional[int]
    section_end_line: Optional[int]
    focus_rate: float
    regression_count: int
    avg_gaze_speed: Optional[float]
    created_at: datetime
