from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, ConfigDict
from ...db.models import (
    UserRole, ReadingStatus, EventType, Difficulty,
    ReadingPattern, TriggerReason, InterventionType,
)


# ── User ──────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    password_hash: str
    nickname: str
    role: Optional[UserRole] = UserRole.USER


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    nickname: str
    role: UserRole
    created_at: datetime
    updated_at: datetime


# ── Calibration ───────────────────────────────────────────────────────────────

class CalibrationCreate(BaseModel):
    user_id: int
    calibration_params: Dict[str, Any]
    accuracy_score: Optional[float] = None


class CalibrationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    calibration_params: Dict[str, Any]
    accuracy_score: Optional[float]
    calibrated_at: datetime


# ── TextContent ───────────────────────────────────────────────────────────────

class TextContentCreate(BaseModel):
    title: str
    body: str
    total_sentences: Optional[int] = None
    total_paragraphs: Optional[int] = None
    difficulty: Optional[Difficulty] = None


class TextContentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    body: str
    total_sentences: Optional[int]
    total_paragraphs: Optional[int]
    difficulty: Optional[Difficulty]
    created_at: datetime


# ── ReadingSession ────────────────────────────────────────────────────────────

class ReadingSessionCreate(BaseModel):
    user_id: int
    text_id: int
    calibration_id: int


class ReadingSessionUpdate(BaseModel):
    ended_at: Optional[datetime] = None
    status: Optional[ReadingStatus] = None
    total_duration_ms: Optional[int] = None


class ReadingSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    text_id: int
    calibration_id: int
    started_at: datetime
    ended_at: Optional[datetime]
    status: ReadingStatus
    total_duration_ms: Optional[int]


# ── GazeEvent ─────────────────────────────────────────────────────────────────

class GazeEventCreate(BaseModel):
    session_id: int
    event_type: EventType
    gaze_x: Optional[float] = None
    gaze_y: Optional[float] = None
    duration_ms: Optional[int] = None
    sentence_index: Optional[int] = None
    paragraph_index: Optional[int] = None


class GazeEventBulkCreate(BaseModel):
    events: List[GazeEventCreate]


class GazeEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    session_id: int
    event_type: EventType
    gaze_x: Optional[float]
    gaze_y: Optional[float]
    duration_ms: Optional[int]
    sentence_index: Optional[int]
    paragraph_index: Optional[int]
    recorded_at: datetime


# ── ReadingMetric ─────────────────────────────────────────────────────────────

class ReadingMetricCreate(BaseModel):
    session_id: int
    avg_fixation_ms: Optional[float] = None
    regression_ratio: Optional[float] = None
    linearity_score: Optional[float] = None
    concentration_score: Optional[float] = None
    reading_pattern: Optional[ReadingPattern] = None


class ReadingMetricResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    session_id: int
    avg_fixation_ms: Optional[float]
    regression_ratio: Optional[float]
    linearity_score: Optional[float]
    concentration_score: Optional[float]
    reading_pattern: Optional[ReadingPattern]
    calculated_at: datetime


# ── Intervention ──────────────────────────────────────────────────────────────

class InterventionCreate(BaseModel):
    session_id: int
    metric_id: int
    trigger_reason: TriggerReason
    intervention_type: InterventionType
    duration_ms: Optional[int] = None


class InterventionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    session_id: int
    metric_id: int
    trigger_reason: TriggerReason
    intervention_type: InterventionType
    triggered_at: datetime
    duration_ms: Optional[int]
    accepted: bool


# ── SessionReport ─────────────────────────────────────────────────────────────

class SessionReportCreate(BaseModel):
    session_id: int
    heatmap_data: Optional[Dict[str, Any]] = None
    gaze_plot_data: Optional[Dict[str, Any]] = None
    overall_score: Optional[float] = None
    feedback_text: Optional[str] = None


class SessionReportResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    session_id: int
    heatmap_data: Optional[Dict[str, Any]]
    gaze_plot_data: Optional[Dict[str, Any]]
    overall_score: Optional[float]
    feedback_text: Optional[str]
    generated_at: datetime
