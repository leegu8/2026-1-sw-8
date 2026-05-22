from typing import List
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from ...schemas import BookCreate, BookResponse, BookListResponse, CompletedBookItem
from ....db.session import get_db, get_or_404
from ....db.models import Book, ReadingSession

router = APIRouter()


@router.post("/books", response_model=BookResponse, status_code=201)
async def create_book(body: BookCreate, db: AsyncSession = Depends(get_db)):
    book = Book(**body.model_dump())
    db.add(book)
    await db.commit()
    await db.refresh(book)
    return book


@router.get("/books", response_model=List[BookListResponse])
async def list_books(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Book))
    return result.scalars().all()


@router.get("/books/{book_id}", response_model=BookResponse)
async def get_book(book_id: int, db: AsyncSession = Depends(get_db)):
    return await get_or_404(db, Book, book_id, "도서를 찾을 수 없습니다")


@router.delete("/books/{book_id}", status_code=204)
async def delete_book(book_id: int, db: AsyncSession = Depends(get_db)):
    book = await get_or_404(db, Book, book_id, "도서를 찾을 수 없습니다")
    await db.delete(book)
    await db.commit()


@router.get("/users/{user_id}/completed-books", response_model=List[CompletedBookItem])
async def get_completed_books(user_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ReadingSession.book_id)
        .where(
            ReadingSession.user_id == user_id,
            ReadingSession.ended_at.isnot(None),
        )
        .distinct()
    )
    return [CompletedBookItem(book_id=row[0]) for row in result.all()]
