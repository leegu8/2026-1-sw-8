from datetime import datetime, timezone
import enum
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Enum, JSON, Boolean, BigInteger, ForeignKey
from sqlalchemy.orm import DeclarativeBase, relationship


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class UserRole(enum.Enum):
    ADMIN = "admin"
    USER = "user"


class ReadingStatus(enum.Enum):
    ACTIVE = "active"
    COMPLETED = "completed"
    PAUSED = "paused"


class EventType(enum.Enum):
    FIXATION = "fixation"
    SACCADE = "saccade"
    BLINK = "blink"


class Difficulty(enum.Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class ReadingPattern(enum.Enum):
    LINEAR = "linear"
    REGRESSIVE = "regressive"
    SKIMMING = "skimming"


class TriggerReason(enum.Enum):
    LOW_CONCENTRATION = "low_concentration"
    HIGH_REGRESSION = "high_regression"
    LONG_FIXATION = "long_fixation"


class InterventionType(enum.Enum):
    REMINDER = "reminder"
    BREAK = "break"
    ADJUSTMENT = "adjustment"


class User(Base):
    __tablename__ = "users"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    nickname = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.USER)
    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    calibrations = relationship("Calibration", back_populates="user")
    reading_sessions = relationship("ReadingSession", back_populates="user")


class Calibration(Base):
    __tablename__ = "calibrations"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    calibration_params = Column(JSON, nullable=False)
    accuracy_score = Column(Float)
    calibrated_at = Column(DateTime, default=_now)

    user = relationship("User", back_populates="calibrations")
    reading_sessions = relationship("ReadingSession", back_populates="calibration")


class TextContent(Base):
    __tablename__ = "text_contents"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    total_sentences = Column(Integer)
    total_paragraphs = Column(Integer)
    difficulty = Column(Enum(Difficulty))
    created_at = Column(DateTime, default=_now)

    reading_sessions = relationship("ReadingSession", back_populates="text_content")


class ReadingSession(Base):
    __tablename__ = "reading_sessions"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    user_id = Column(BigInteger, ForeignKey("users.id"), nullable=False)
    text_id = Column(BigInteger, ForeignKey("text_contents.id"), nullable=False)
    calibration_id = Column(BigInteger, ForeignKey("calibrations.id"), nullable=False)
    started_at = Column(DateTime, default=_now)
    ended_at = Column(DateTime)
    status = Column(Enum(ReadingStatus), default=ReadingStatus.ACTIVE)
    total_duration_ms = Column(Integer)

    user = relationship("User", back_populates="reading_sessions")
    text_content = relationship("TextContent", back_populates="reading_sessions")
    calibration = relationship("Calibration", back_populates="reading_sessions")
    gaze_events = relationship("GazeEvent", back_populates="session")
    reading_metric = relationship("ReadingMetric", back_populates="session", uselist=False)
    session_report = relationship("SessionReport", back_populates="session", uselist=False)
    interventions = relationship("Intervention", back_populates="session")


class GazeEvent(Base):
    __tablename__ = "gaze_events"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(BigInteger, ForeignKey("reading_sessions.id"), nullable=False)
    event_type = Column(Enum(EventType), nullable=False)
    gaze_x = Column(Float)
    gaze_y = Column(Float)
    duration_ms = Column(Integer)
    sentence_index = Column(Integer)
    paragraph_index = Column(Integer)
    recorded_at = Column(DateTime, default=_now)

    session = relationship("ReadingSession", back_populates="gaze_events")


class ReadingMetric(Base):
    __tablename__ = "reading_metrics"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(BigInteger, ForeignKey("reading_sessions.id"), nullable=False)
    avg_fixation_ms = Column(Float)
    regression_ratio = Column(Float)
    linearity_score = Column(Float)
    concentration_score = Column(Float)
    reading_pattern = Column(Enum(ReadingPattern))
    calculated_at = Column(DateTime, default=_now)

    session = relationship("ReadingSession", back_populates="reading_metric")
    interventions = relationship("Intervention", back_populates="metric")


class Intervention(Base):
    __tablename__ = "interventions"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(BigInteger, ForeignKey("reading_sessions.id"), nullable=False)
    metric_id = Column(BigInteger, ForeignKey("reading_metrics.id"), nullable=False)
    trigger_reason = Column(Enum(TriggerReason), nullable=False)
    intervention_type = Column(Enum(InterventionType), nullable=False)
    triggered_at = Column(DateTime, default=_now)
    duration_ms = Column(Integer)
    accepted = Column(Boolean, default=False)

    session = relationship("ReadingSession", back_populates="interventions")
    metric = relationship("ReadingMetric", back_populates="interventions")


class SessionReport(Base):
    __tablename__ = "session_reports"
    id = Column(BigInteger, primary_key=True, autoincrement=True)
    session_id = Column(BigInteger, ForeignKey("reading_sessions.id"), nullable=False)
    heatmap_data = Column(JSON)
    gaze_plot_data = Column(JSON)
    overall_score = Column(Float)
    feedback_text = Column(Text)
    generated_at = Column(DateTime, default=_now)

    session = relationship("ReadingSession", back_populates="session_report")
