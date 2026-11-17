from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator


class ServiceBase(BaseModel):
    title: str
    description: str | None = None
    price: float
    duration_minutes: int = 60
    is_active: bool = True


class ServiceCreate(ServiceBase):
    pass


class ServiceRead(ServiceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime


class MasterBase(BaseModel):
    name: str
    specialty: str
    phone: str | None = None
    bio: str | None = None
    photo_url: str | None = None
    rating: float | None = None
    experience_years: int | None = None
    is_active: bool = True


class MasterCreate(MasterBase):
    service_ids: list[int] = []


class MasterRead(MasterBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    services: list[ServiceRead] = []


class AppointmentCreate(BaseModel):
    client_name: str
    client_phone: str
    master_id: int
    service_id: int
    start_time: datetime

    @field_validator("client_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if not 2 <= len(value) <= 50:
            raise ValueError("Имя должно содержать от 2 до 50 символов")
        if not any(ch.isalpha() for ch in value):
            raise ValueError("Имя должно содержать хотя бы одну букву")
        return value

    @field_validator("client_phone")
    @classmethod
    def clean_phone(cls, value: str) -> str:
        digits = "".join(ch for ch in value if ch.isdigit())
        if not 10 <= len(digits) <= 15:
            raise ValueError("Телефон должен содержать от 10 до 15 цифр")
        return value.strip()


class AppointmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    master_id: int
    service_id: int
    start_at: datetime
    status: str


class AdminAppointmentRead(BaseModel):
    id: int
    client_name: str | None
    client_phone: str
    master_name: str
    service_title: str
    price: float
    start_at: datetime
    status: str


class AppointmentUpdate(BaseModel):
    client_name: str | None = None
    client_phone: str | None = None
    master_id: int | None = None
    service_id: int | None = None
    start_time: datetime | None = None
    status: str | None = None

    @field_validator("client_name")
    @classmethod
    def clean_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not 2 <= len(value) <= 50 or not any(ch.isalpha() for ch in value):
            raise ValueError("Имя должно содержать 2–50 символов, включая буквы")
        return value

    @field_validator("client_phone")
    @classmethod
    def clean_phone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        digits = "".join(ch for ch in value if ch.isdigit())
        if not 10 <= len(digits) <= 15:
            raise ValueError("Телефон должен содержать от 10 до 15 цифр")
        return value.strip()

    @field_validator("status")
    @classmethod
    def valid_status(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if value not in ("pending", "completed", "cancelled"):
            raise ValueError("Недопустимый статус")
        return value


class StatusUpdate(BaseModel):
    status: str

    @field_validator("status")
    @classmethod
    def valid_status(cls, value: str) -> str:
        if value not in ("completed", "cancelled"):
            raise ValueError("Допустимые статусы: completed, cancelled")
        return value
