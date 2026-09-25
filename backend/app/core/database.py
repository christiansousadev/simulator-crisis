from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# sqlite connection configuration with multithread support for async ticks
connect_args = {"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """YIELD DATABASE SESSION PER REQUEST CONTEXT"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
