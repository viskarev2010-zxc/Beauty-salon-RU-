from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Appointment, Master, Service, User
from ..rate_limit import RateLimiter
from ..schemas import AdminAppointmentRead, AppointmentUpdate, MasterCreate, ServiceCreate
from ..security import create_access_token, get_current_admin, verify_password
from .public import WORK_END, WORK_START, _busy_intervals, _free

router = APIRouter(prefix="/api/admin", tags=["admin"])

login_limiter = RateLimiter(limit=5)


@router.post("/login")
def login(payload: dict, _rl: None = Depends(login_limiter), db: Session = Depends(get_db)):
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    user = db.scalar(select(User).where(User.username == username))
    if not user or not verify_password(password, user.password_hash) or user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль",
        )
    return {"access_token": create_access_token(user.username), "token_type": "bearer"}


@router.get("/stats")
def stats(db: Session = Depends(get_db), _admin: User = Depends(get_current_admin)):
    now = datetime.now()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    next_month = month_start + timedelta(days=32)
    next_month = next_month.replace(day=1)

    revenue = db.scalar(
        select(func.coalesce(func.sum(Service.price), 0))
        .select_from(Appointment)
        .join(Service, Appointment.service_id == Service.id)
        .where(Appointment.status == "completed")
    )
    month_count = db.scalar(
        select(func.count()).select_from(Appointment).where(
            Appointment.start_at >= month_start, Appointment.start_at < next_month
        )
    )
    upcoming_count = db.scalar(
        select(func.count()).select_from(Appointment).where(
            Appointment.status == "pending", Appointment.start_at >= now
        )
    )
    return {
        "revenue_completed": float(revenue),
        "appointments_this_month": month_count,
        "active_upcoming": upcoming_count,
    }


@router.get("/appointments", response_model=list[AdminAppointmentRead])
def list_appointments(
    date: date | None = None,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    stmt = select(Appointment).order_by(Appointment.start_at)
    if date is not None:
        stmt = stmt.where(func.date(Appointment.start_at) == date)
    rows = db.scalars(stmt).all()
    return [_appointment_read(a) for a in rows]


def _appointment_read(a: Appointment) -> AdminAppointmentRead:
    return AdminAppointmentRead(
        id=a.id,
        client_name=a.client.name or "Без имени",
        client_phone=a.client.username,
        master_name=a.master.name,
        service_title=a.service.title,
        price=float(a.service.price),
        start_at=a.start_at,
        status=a.status,
    )


@router.patch("/appointments/{appointment_id}")
def update_appointment(
    appointment_id: int,
    payload: AppointmentUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    appointment = db.get(Appointment, appointment_id)
    if not appointment:
        raise HTTPException(404, "Запись не найдена")

    if payload.client_name is not None:
        appointment.client.name = payload.client_name
    if payload.client_phone is not None:
        phone = payload.client_phone
        client = db.scalar(select(User).where(User.username == phone))
        if not client:
            client = User(username=phone, email=f"{phone}@guest.local", password_hash="", role="client", name=payload.client_name or appointment.client.name)
            db.add(client)
            db.flush()
        appointment.client_id = client.id
    if payload.status is not None:
        appointment.status = payload.status

    if any(v is not None for v in (payload.master_id, payload.service_id, payload.start_time)):
        master_id = payload.master_id or appointment.master_id
        service_id = payload.service_id or appointment.service_id
        start = (payload.start_time or appointment.start_at).replace(second=0, microsecond=0)

        service = db.get(Service, service_id)
        if not service or not service.is_active:
            raise HTTPException(404, "Услуга не найдена")
        master = db.get(Master, master_id)
        if not master or not master.is_active:
            raise HTTPException(404, "Мастер не найден")
        if service not in master.services:
            raise HTTPException(400, "Мастер не оказывает выбранную услугу")

        end = start + timedelta(minutes=service.duration_minutes)
        day_start = datetime.combine(start.date(), WORK_START)
        day_end = datetime.combine(start.date(), WORK_END)
        if start < day_start or end > day_end:
            raise HTTPException(400, "Запись должна быть в рабочее время 10:00–20:00")
        if not _free(_busy_intervals(db, master.id, day_start, day_end, exclude_id=appointment.id), start, end):
            raise HTTPException(409, "Это время уже занято у выбранного мастера")

        appointment.master_id = master.id
        appointment.service_id = service.id
        appointment.start_at = start

    db.commit()
    db.refresh(appointment)
    return _appointment_read(appointment)


@router.delete("/appointments/{appointment_id}")
def delete_appointment(
    appointment_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    appointment = db.get(Appointment, appointment_id)
    if not appointment:
        raise HTTPException(404, "Запись не найдена")
    db.delete(appointment)
    db.commit()
    return {"ok": True}


@router.post("/services", status_code=201)
def create_service(
    payload: ServiceCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    service = Service(
        title=payload.title,
        description=payload.description,
        price=payload.price,
        duration_minutes=payload.duration_minutes,
        is_active=payload.is_active,
    )
    db.add(service)
    db.commit()
    db.refresh(service)
    return {"id": service.id, "title": service.title}


@router.post("/masters", status_code=201)
def create_master(
    payload: MasterCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    master = Master(name=payload.name, specialty=payload.specialty, phone=payload.phone, bio=payload.bio)
    for sid in payload.service_ids:
        service = db.get(Service, sid)
        if service:
            master.services.append(service)
    db.add(master)
    db.commit()
    db.refresh(master)
    return {"id": master.id, "name": master.name, "services": [s.id for s in master.services]}
