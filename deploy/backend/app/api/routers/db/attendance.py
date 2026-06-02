from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...schemas import AttendanceCreate, AttendanceCheckResponse
from ....db.session import get_db
from ....db.models import Attendance

router = APIRouter()


@router.post("/attendance", response_model=AttendanceCheckResponse, status_code=201)
async def create_attendance(body: AttendanceCreate, db: AsyncSession = Depends(get_db)):
    today = date.today()
    existing = await db.execute(
        select(Attendance).where(
            Attendance.user_id == body.user_id,
            Attendance.attended_at == today,
        )
    )
    if existing.scalar_one_or_none():
        return AttendanceCheckResponse(checked=False)

    db.add(Attendance(user_id=body.user_id, attended_at=today))
    await db.commit()
    return AttendanceCheckResponse(checked=True)
