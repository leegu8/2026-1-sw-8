from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from fastapi import HTTPException
from ..core.config import DATABASE_URL
from .models import Base

engine = create_async_engine(DATABASE_URL, echo=True)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_db():
    async with async_session() as session:
        yield session


async def get_or_404(db: AsyncSession, model, pk: int, detail: str):
    obj = await db.get(model, pk)
    if not obj:
        raise HTTPException(status_code=404, detail=detail)
    return obj
