"""Creating and authenticating accounts. Used by the API and the CLI."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.errors import ApiError
from app.models import Role, User
from app.services import security


def normalize_email(email: str) -> str:
    return email.strip().lower()


def find_by_email(db: Session, email: str) -> User | None:
    return db.scalars(select(User).where(User.email == normalize_email(email))).first()


def email_taken() -> ApiError:
    return ApiError(409, "email_taken", "An account with this email already exists.")


def create_user(db: Session, *, email: str, full_name: str, password: str, role: Role) -> User:
    if find_by_email(db, email):
        raise email_taken()
    user = User(
        email=normalize_email(email),
        full_name=full_name.strip(),
        password_hash=security.hash_password(password),
        role=role,
    )
    db.add(user)
    db.flush()
    return user


def authenticate(db: Session, email: str, password: str) -> User | None:
    user = find_by_email(db, email)
    if user is None:
        security.burn_password_check(password)
        return None
    return user if security.verify_password(user.password_hash, password) else None


def set_password(user: User, password: str) -> None:
    user.password_hash = security.hash_password(password)
