import re
from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...schemas import TextContentCreate, TextContentResponse
from ....db.session import get_db, get_or_404
from ....db.models import TextContent

router = APIRouter()


def _count_paragraphs(text: str) -> int:
    return len([p for p in text.split('\n\n') if p.strip()])


def _count_sentences(text: str) -> int:
    return len([s for s in re.split(r'[.?!。]\s*', text) if s.strip()])


@router.post("/texts", response_model=TextContentResponse, status_code=201)
async def create_text(body: TextContentCreate, db: AsyncSession = Depends(get_db)):
    data = body.model_dump()
    if data.get('total_paragraphs') is None:
        data['total_paragraphs'] = _count_paragraphs(data['body'])
    if data.get('total_sentences') is None:
        data['total_sentences'] = _count_sentences(data['body'])
    text = TextContent(**data)
    db.add(text)
    await db.commit()
    await db.refresh(text)
    return text


@router.get("/texts", response_model=List[TextContentResponse])
async def list_texts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TextContent))
    return result.scalars().all()


@router.get("/texts/{text_id}", response_model=TextContentResponse)
async def get_text(text_id: int, db: AsyncSession = Depends(get_db)):
    return await get_or_404(db, TextContent, text_id, "텍스트를 찾을 수 없습니다")


@router.delete("/texts/{text_id}", status_code=204)
async def delete_text(text_id: int, db: AsyncSession = Depends(get_db)):
    text = await get_or_404(db, TextContent, text_id, "텍스트를 찾을 수 없습니다")
    await db.delete(text)
    await db.commit()
