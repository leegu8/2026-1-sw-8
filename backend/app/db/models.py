from datetime import datetime, date, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Text, ForeignKey, JSON
from sqlalchemy.orm import DeclarativeBase, relationship


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    nickname = Column(String, nullable=False)
    created_at = Column(DateTime, default=_now)

    level_histories = relationship("LevelHistory", back_populates="user")
    attendances = relationship("Attendance", back_populates="user")
    reading_sessions = relationship("ReadingSession", back_populates="user")


class LevelHistory(Base):
    __tablename__ = "level_history"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    level_result = Column(String)
    tested_at = Column(DateTime, default=_now)

    user = relationship("User", back_populates="level_histories")


class Attendance(Base):
    __tablename__ = "attendance"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    attended_at = Column(Date, nullable=False)

    user = relationship("User", back_populates="attendances")


class Book(Base):
    __tablename__ = "books"
    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    difficulty = Column(String)
    genre = Column(String)
    created_at = Column(DateTime, default=_now)

    reading_sessions = relationship("ReadingSession", back_populates="book")


class ReadingSession(Base):
    __tablename__ = "reading_sessions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    started_at = Column(DateTime, default=_now)
    ended_at = Column(DateTime)
    total_duration_sec = Column(Integer)
    x_min = Column(Float)
    x_max = Column(Float)
    wpm = Column(Float)
    concentration_score = Column(Float)
    base_vel = Column(Float)
    end_vel = Column(Float)
    regression_ratio = Column(Float)
    visited_lines = Column(Integer)
    total_lines = Column(Integer)

    user = relationship("User", back_populates="reading_sessions")
    book = relationship("Book", back_populates="reading_sessions")
    correction_events = relationship("CorrectionEvent", back_populates="session")
    gaze_summaries = relationship("GazeSummary", back_populates="session")


class CorrectionEvent(Base):
    __tablename__ = "correction_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("reading_sessions.id"), nullable=False)
    event_type = Column(String, nullable=False)
    triggered_at = Column(DateTime, default=_now)

    session = relationship("ReadingSession", back_populates="correction_events")


class GazeSummary(Base):
    __tablename__ = "gaze_summary"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("reading_sessions.id"), nullable=False)
    section_index = Column(Integer, nullable=False)
    section_start_sec = Column(Integer, nullable=False)
    section_end_sec = Column(Integer, nullable=False)
    section_start_line = Column(Integer)
    section_end_line = Column(Integer)
    focus_rate = Column(Float, nullable=False)
    regression_count = Column(Integer, nullable=False)
    avg_gaze_speed = Column(Float)
    non_concentrated_ms = Column(Integer, default=0)
    visited_line_indices = Column(JSON, default=list)
    created_at = Column(DateTime, default=_now)

    session = relationship("ReadingSession", back_populates="gaze_summaries")
