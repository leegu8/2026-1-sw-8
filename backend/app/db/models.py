from datetime import datetime, date, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Text, ForeignKey
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
    wpm = Column(Float)
    concentration_score = Column(Float)
    regression_ratio = Column(Float)
    visited_lines = Column(Integer)
    total_lines = Column(Integer)
    word_count = Column(Integer)
    score = Column(Float)

    user = relationship("User", back_populates="reading_sessions")
    book = relationship("Book", back_populates="reading_sessions")
    correction_events = relationship("CorrectionEvent", back_populates="session")


class CorrectionEvent(Base):
    __tablename__ = "correction_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(Integer, ForeignKey("reading_sessions.id"), nullable=False)
    event_type = Column(String, nullable=False)
    line_index = Column(Integer)
    triggered_at = Column(DateTime, default=_now)

    session = relationship("ReadingSession", back_populates="correction_events")


