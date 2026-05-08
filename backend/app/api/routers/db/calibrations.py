from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from ...schemas import CalibrationCreate, CalibrationResponse
from ....db.session import get_db, get_or_404
from ....db.models import Calibration

router = APIRouter()


@router.post("/calibrations", response_model=CalibrationResponse, status_code=201)
async def create_calibration(body: CalibrationCreate, db: AsyncSession = Depends(get_db)):
    cal = Calibration(**body.model_dump())
    db.add(cal)
    await db.commit()
    await db.refresh(cal)
    return cal


@router.get("/calibrations/{cal_id}", response_model=CalibrationResponse)
async def get_calibration(cal_id: int, db: AsyncSession = Depends(get_db)):
    return await get_or_404(db, Calibration, cal_id, "보정 데이터를 찾을 수 없습니다")
