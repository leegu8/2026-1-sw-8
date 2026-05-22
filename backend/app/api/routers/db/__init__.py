from fastapi import APIRouter
from . import users, books, level_history, attendance, sessions, correction_events, gaze_summary, result, growth

router = APIRouter(prefix="/api/db", tags=["database"])
for _sub in (users, books, level_history, attendance, sessions, correction_events, gaze_summary, result, growth):
    router.include_router(_sub.router)
