from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Appointment, Master, Service, User
from ..rate_limit import RateLimiter
from ..schemas import AppointmentCreate, AppointmentRead, MasterRead, ServiceRead

router = APIRouter(prefix="/api", tags=["public"])

appointment_limiter = RateLimiter(limit=5)

WORK_START = time(10, 0)
WORK_END = time(20, 0)
STEP = timedelta(minutes=30)


@router.get("/services", response_model=list[ServiceRead])
def list_services(db: Session = Depends(get_db)):
    return db.scalars(select(Service).where(Service.is_active.is_(True))).all()


@router.get("/masters", response_model=list[MasterRead])
def list_masters(service_id: int | None = None, db: Session = Depends(get_db)):
    stmt = select(Master).where(Master.is_active.is_(True))
    if service_id is not None:
        stmt = stmt.join(Master.services).where(Service.id == service_id)
    return db.scalars(stmt).all()


def _busy_intervals(db: Session, master_id: int, day_start: datetime, day_end: datetime, exclude_id: int | None = None):
    stmt = (
        select(Appointment.start_at, Service.duration_minutes)
        .join(Service, Appointment.service_id == Service.id)
        .where(
            Appointment.master_id == master_id,
            Appointment.status != "cancelled",
            Appointment.start_at >= day_start,
            Appointment.start_at < day_end,
        )
    )
    if exclude_id is not None:
        stmt = stmt.where(Appointment.id != exclude_id)
    rows = db.execute(stmt).all()
    return [(start, start + timedelta(minutes=duration)) for start, duration in rows]


def _free(intervals, start: datetime, end: datetime) -> bool:
    return all(end <= s or start >= e for s, e in intervals)


@router.get("/slots", response_model=list[str])
def list_slots(master_id: int, service_id: int, date: date, db: Session = Depends(get_db)):
    service = db.get(Service, service_id)
    if not service or not service.is_active:
        raise HTTPException(404, "Услуга не найдена")
    master = db.get(Master, master_id)
    if not master or not master.is_active:
        raise HTTPException(404, "Мастер не найден")

    duration = timedelta(minutes=service.duration_minutes)
    day_start = datetime.combine(date, WORK_START)
    day_end = datetime.combine(date, WORK_END)
    intervals = _busy_intervals(db, master_id, day_start, day_end)
    now = datetime.now()

    slots = []
    current = day_start
    while current + duration <= day_end:
        in_past = current.date() == now.date() and current <= now
        if not in_past and _free(intervals, current, current + duration):
            slots.append(current.strftime("%H:%M"))
        current += STEP
    return slots


@router.post("/appointments", response_model=AppointmentRead, status_code=201)
def create_appointment(data: AppointmentCreate, db: Session = Depends(get_db), _rl: None = Depends(appointment_limiter)):
    service = db.get(Service, data.service_id)
    master = db.get(Master, data.master_id)
    if not service or not service.is_active:
        raise HTTPException(404, "Услуга не найдена")
    if not master or not master.is_active:
        raise HTTPException(404, "Мастер не найден")
    if service not in master.services:
        raise HTTPException(400, "Мастер не оказывает выбранную услугу")

    start = data.start_time.replace(second=0, microsecond=0)
    end = start + timedelta(minutes=service.duration_minutes)
    day_start = datetime.combine(start.date(), WORK_START)
    day_end = datetime.combine(start.date(), WORK_END)
    if start < day_start or end > day_end:
        raise HTTPException(400, "Запись должна быть в рабочее время 10:00–20:00")
    if start < datetime.now():
        raise HTTPException(400, "Выбранное время уже прошло")
    if not _free(_busy_intervals(db, master.id, day_start, day_end), start, end):
        raise HTTPException(409, "Это время уже занято, выберите другое")

    phone = data.client_phone.strip()
    client = db.scalar(select(User).where(User.username == phone))
    if not client:
        client = User(username=phone, email=f"{phone}@guest.local", password_hash="", role="client", name=data.client_name)
        db.add(client)
        db.flush()
    elif client.name != data.client_name:
        client.name = data.client_name

    appointment = Appointment(
        client_id=client.id,
        master_id=master.id,
        service_id=service.id,
        start_at=start,
    )
    db.add(appointment)
    db.commit()
    db.refresh(appointment)
    return appointment
