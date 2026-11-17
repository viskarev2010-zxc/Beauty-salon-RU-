import os
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

load_dotenv()

from .database import get_db
from .models import User

ALGORITHM = "HS256"

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def create_access_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))
    )
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, os.getenv("SECRET_KEY", ""), algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    return jwt.decode(token, os.getenv("SECRET_KEY", ""), algorithms=[ALGORITHM])


def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Недействительный или истекший токен",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = decode_token(credentials.credentials)
        username: str = payload.get("sub", "")
    except jwt.PyJWTError:
        raise unauthorized
    user = db.query(User).filter(User.username == username).one_or_none()
    if not user or user.role != "admin" or not user.is_active:
        raise unauthorized
    return user
