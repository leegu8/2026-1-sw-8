from fastapi import APIRouter
from . import users, calibrations, texts, sessions, events, metrics, interventions, reports

router = APIRouter(prefix="/api/db", tags=["database"])
for _sub in (users, calibrations, texts, sessions, events, metrics, interventions, reports):
    router.include_router(_sub.router)
