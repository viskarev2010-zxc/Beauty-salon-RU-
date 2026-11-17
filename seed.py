import os

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import func, select, text

from app.database import Base, SessionLocal, engine
from app.models import Master, Service, User
from app.security import hash_password


def seed() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(128)"))
        conn.execute(text("ALTER TABLE masters ADD COLUMN IF NOT EXISTS photo_url VARCHAR(512)"))
        conn.execute(text("ALTER TABLE masters ADD COLUMN IF NOT EXISTS rating FLOAT"))
        conn.execute(text("ALTER TABLE masters ADD COLUMN IF NOT EXISTS experience_years INTEGER"))

    with SessionLocal() as db:
        backfill = {
            "Анна Смирнова": (
                "https://api.dicebear.com/9.x/notionists/svg?seed=anna-smirnova&backgroundColor=ffe4e6", 4.9, 6,
            ),
            "Дмитрий Орлов": (
                "https://api.dicebear.com/9.x/notionists/svg?seed=dmitry-orlov&backgroundColor=e0e7ff", 4.8, 9,
            ),
        }
        for master in db.scalars(select(Master)).all():
            if master.name in backfill and master.photo_url is None:
                master.photo_url, master.rating, master.experience_years = backfill[master.name]
        db.commit()

    with SessionLocal() as db:
        if not db.scalar(select(User).where(User.username == "admin")):
            db.add(
                User(
                    username="admin",
                    email="admin@salon.local",
                    password_hash=hash_password("admin123"),
                    role="admin",
                )
            )
            db.commit()
            print("Администратор admin создан.")

        count = db.scalar(select(func.count()).select_from(Master))
        if count:
            print(f"База уже содержит данные ({count} мастеров) — seed данных пропущен.")
            return

        masters = [
            Master(
                name="Анна Смирнова", specialty="Мастер маникюра", phone="+7-900-111-22-33",
                photo_url="https://api.dicebear.com/9.x/notionists/svg?seed=anna-smirnova&backgroundColor=ffe4e6",
                rating=4.9, experience_years=6,
            ),
            Master(
                name="Дмитрий Орлов", specialty="Парикмахер-стилист", phone="+7-900-444-55-66",
                photo_url="https://api.dicebear.com/9.x/notionists/svg?seed=dmitry-orlov&backgroundColor=e0e7ff",
                rating=4.8, experience_years=9,
            ),
        ]
        services = [
            Service(title="Маникюр классический", description="Обрезной маникюр с покрытием гель-лаком", price=1800, duration_minutes=90),
            Service(title="Женская стрижка", description="Стрижка, мытьё и укладка", price=1500, duration_minutes=60),
            Service(title="Окрашивание в один тон", description="Окрашивание корней или по всей длине", price=3500, duration_minutes=120),
        ]
        db.add_all(masters)
        db.add_all(services)
        db.commit()

        for service, master_ids in zip(services, [(0,), (1,), (1,)]):
            for i in master_ids:
                service.masters.append(masters[i])
        db.commit()
        print("Seed выполнен: 2 мастера, 3 услуги.")


if __name__ == "__main__":
    seed()
