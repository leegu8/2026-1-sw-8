import os

_url = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///./eye_tracking.db")

# Render는 postgres:// 형식으로 주입 — asyncpg는 postgresql+asyncpg:// 필요
if _url.startswith("postgres://"):
    _url = _url.replace("postgres://", "postgresql+asyncpg://", 1)
elif _url.startswith("postgresql://") and "+asyncpg" not in _url:
    _url = _url.replace("postgresql://", "postgresql+asyncpg://", 1)

DATABASE_URL = _url
