from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...schemas import InterventionCreate, InterventionResponse
from ....db.session import get_db, get_or_404
from ....db.models import Intervention

router = APIRouter()


@router.post("/interventions", response_model=InterventionResponse, status_code=201)
async def create_intervention(body: InterventionCreate, db: AsyncSession = Depends(get_db)):
    intervention = Intervention(**body.model_dump())
    db.add(intervention)
    await db.commit()
    await db.refresh(intervention)
    return intervention


@router.get("/sessions/{session_id}/interventions", response_model=List[InterventionResponse])
async def get_interventions_by_session(session_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Intervention).where(Intervention.session_id == session_id)
    )
    return result.scalars().all()


@router.patch("/interventions/{intervention_id}/accept", response_model=InterventionResponse)
async def accept_intervention(intervention_id: int, db: AsyncSession = Depends(get_db)):
    intervention = await get_or_404(db, Intervention, intervention_id, "개입을 찾을 수 없습니다")
    intervention.accepted = True
    await db.commit()
    await db.refresh(intervention)
    return intervention
