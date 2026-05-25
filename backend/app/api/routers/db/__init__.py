from fastapi import APIRouter
from . import books, level_history, attendance, sessions, correction_events, result, growth

router = APIRouter(prefix="/api/db", tags=["database"])
for _sub in (books, level_history, attendance, sessions, correction_events, result, growth):
    router.include_router(_sub.router)
