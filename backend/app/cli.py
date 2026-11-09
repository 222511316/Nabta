"""Team commands. Run from backend/:

    python -m app.cli create-specialist --email E --name N [--password P]
    python -m app.cli seed-demo

Specialist accounts can only be created here: the public sign-up page makes growers (US08).
"""

import argparse
import getpass
import sys

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db import create_db_engine, create_session_factory
from app.errors import ApiError
from app.models import Plant, Role
from app.schemas.users import RegisterIn
from app.services import users

DEMO_PASSWORD = "NabtaDemo2026"
DEMO_PLANTS = [
    ("Lemon tree", "Lemon", "Back garden"),
    ("Balcony tomatoes", "Tomato", "Balcony planter"),
    ("Damask rose", "Rose", "Front yard"),
]


class CommandError(Exception):
    pass


def _validated(email: str, name: str, password: str) -> RegisterIn:
    """Applies the same rules as the sign-up form."""
    try:
        return RegisterIn(full_name=name, email=email, password=password)
    except ValidationError as error:
        problems = ", ".join(f"{e['loc'][0]}: {e['msg']}" for e in error.errors())
        raise CommandError(f"Invalid details ({problems}).") from None


def _ask_password() -> str:
    password = getpass.getpass("Password for the specialist: ")
    if getpass.getpass("Repeat the password: ") != password:
        raise CommandError("The passwords do not match.")
    return password


def create_specialist(db: Session, email: str, name: str, password: str | None) -> str:
    details = _validated(email, name, password if password is not None else _ask_password())
    try:
        user = users.create_user(
            db,
            email=details.email,
            full_name=details.full_name,
            password=details.password,
            role=Role.SPECIALIST,
        )
    except ApiError:
        raise CommandError(f"An account for {details.email} already exists.") from None
    db.commit()
    return f"Created specialist account {user.email} ({user.full_name})."


def seed_demo(db: Session) -> str:
    """Demo accounts for trying the app. Running it again changes nothing."""
    created = []
    for email, name, role in (
        ("grower@example.com", "Sara Ahmed", Role.GROWER),
        ("specialist@example.com", "Khalid Alharbi", Role.SPECIALIST),
    ):
        if users.find_by_email(db, email) is None:
            users.create_user(db, email=email, full_name=name, password=DEMO_PASSWORD, role=role)
            created.append(email)

    grower = users.find_by_email(db, "grower@example.com")
    if not db.scalars(select(Plant).where(Plant.owner_id == grower.id)).first():
        for name, plant_type, location in DEMO_PLANTS:
            db.add(Plant(owner_id=grower.id, name=name, plant_type=plant_type, location=location))
        created.append(f"{len(DEMO_PLANTS)} plants for grower@example.com")
    db.commit()
    if not created:
        return "Demo data already present; nothing changed."
    return f"Created {', '.join(created)}. Demo password: {DEMO_PASSWORD}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Nabta team commands.")
    commands = parser.add_subparsers(dest="command", required=True)
    specialist = commands.add_parser("create-specialist", help="Create a plant specialist account.")
    specialist.add_argument("--email", required=True)
    specialist.add_argument("--name", required=True, help="Full name shown to growers.")
    specialist.add_argument("--password", help="Omit to be asked for it without echoing.")
    commands.add_parser("seed-demo", help="Create demo accounts and plants for trying the app.")
    return parser


def main(argv: list[str] | None = None, settings: Settings | None = None) -> int:
    args = build_parser().parse_args(argv)
    engine = create_db_engine((settings or Settings()).database_url)
    db = create_session_factory(engine)()
    try:
        if args.command == "create-specialist":
            message = create_specialist(db, args.email, args.name, args.password)
        else:
            message = seed_demo(db)
    except CommandError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1
    finally:
        db.close()
        engine.dispose()
    print(message)
    return 0


if __name__ == "__main__":
    sys.exit(main())
