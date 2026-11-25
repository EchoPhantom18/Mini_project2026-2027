"""
backend/db/session.py - Database Connection & Session Management for JALDHRISHTI.

Supports:
- PostgreSQL + PostGIS via DATABASE_URL environment variable
- Automatic fallback to local SQLite database (data/jaldhrishti.db) if Postgres is not configured
"""

import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, scoped_session
from backend.db.models import Base

# Database URL from environment or default
DEFAULT_PG_URL = "postgresql://postgres:postgres@localhost:5432/jaldhrishti"
SQLITE_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "jaldhrishti.db"
DEFAULT_SQLITE_URL = f"sqlite:///{SQLITE_PATH}"

DATABASE_URL = os.getenv("DATABASE_URL")

engine = None
_SessionFactory = None


def get_engine():
    """Initializes and returns the database engine with automatic fallback."""
    global engine, _SessionFactory
    if engine is not None:
        return engine

    target_url = DATABASE_URL
    # Try PostgreSQL first if explicit DATABASE_URL is set
    if target_url and target_url.startswith("postgres"):
        try:
            print(f"[DB] Attempting PostgreSQL connection to {target_url.split('@')[-1]}...")
            test_engine = create_engine(target_url, pool_pre_ping=True)
            with test_engine.connect() as conn:
                print("[DB] PostgreSQL connection successful.")
            engine = test_engine
        except Exception as e:
            print(f"[DB] PostgreSQL unavailable ({e}). Falling back to SQLite.")
            target_url = None

    if target_url is None:
        target_url = DEFAULT_SQLITE_URL
        print(f"[DB] Using database: {target_url}")
        engine = create_engine(
            target_url,
            connect_args={"check_same_thread": False} if target_url.startswith("sqlite") else {}
        )

    _SessionFactory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    return engine


def get_session():
    """Returns a new SQLAlchemy database session."""
    get_engine()
    return _SessionFactory()


def init_db():
    """Creates all database tables defined in models.py."""
    eng = get_engine()
    Base.metadata.create_all(bind=eng)
    print(f"[DB] Initialized database tables on {eng.url.drivername}")


def get_db():
    """FastAPI dependency for yielding database session."""
    session = get_session()
    try:
        yield session
    finally:
        session.close()
