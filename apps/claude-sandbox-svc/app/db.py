"""SQLAlchemy session setup."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.models import Base


def _make_engine():
    settings = get_settings()
    url = f"sqlite:///{settings.db_path}"
    # check_same_thread=False because the task runner is in a background thread.
    return create_engine(url, future=True, connect_args={"check_same_thread": False})


_engine = None
_SessionLocal: sessionmaker[Session] | None = None


def init_db() -> None:
    global _engine, _SessionLocal
    if _engine is None:
        _engine = _make_engine()
        Base.metadata.create_all(_engine)
        _SessionLocal = sessionmaker(bind=_engine, expire_on_commit=False, autoflush=False)


def session_factory() -> sessionmaker[Session]:
    if _SessionLocal is None:
        init_db()
    assert _SessionLocal is not None
    return _SessionLocal


@contextmanager
def session_scope() -> Iterator[Session]:
    """Context-managed session that commits on success and rolls back on error."""
    SessionLocal = session_factory()
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
