from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from api.config import settings

engine: AsyncEngine = create_async_engine(
    settings.database_url.replace("postgresql://", "postgresql+psycopg://"),
    pool_size=5,
    max_overflow=10,
    pool_pre_ping=True,
)

async_session_maker = async_sessionmaker(engine, expire_on_commit=False)
