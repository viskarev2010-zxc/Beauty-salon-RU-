from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from .database import Base, engine
from .routers import admin, public

app = FastAPI(title="Мини-CRM: онлайн-запись", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(128)"))
        conn.execute(text("ALTER TABLE masters ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512)"))
        conn.execute(text("ALTER TABLE masters ADD COLUMN IF NOT EXISTS rating FLOAT"))
        conn.execute(text("ALTER TABLE masters ADD COLUMN IF NOT EXISTS experience_years INTEGER"))


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


app.include_router(public.router)
app.include_router(admin.router)
app.mount(
    "/",
    StaticFiles(directory=Path(__file__).resolve().parent.parent / "frontend", html=True),
    name="frontend",
)
