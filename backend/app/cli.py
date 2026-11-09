"""Team commands. Run from backend/:

    python -m app.cli create-specialist --email E --name N [--password P]
    python -m app.cli seed-demo [--reset]

Both roles can also sign up on the website; this command is for the team's own accounts.
"""

import argparse
import getpass
import sys
from datetime import UTC, datetime, timedelta

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.analysis.classifier import load_classifier
from app.config import BACKEND_DIR, Settings
from app.db import create_db_engine, create_session_factory
from app.errors import ApiError
from app.models import Observation, Plant, Role
from app.pests import load_catalog
from app.schemas.reviews import FeedbackIn
from app.schemas.users import RegisterIn
from app.services import analysis, observations, photos, reviews, users

DEMO_PASSWORD = "NabtaDemo2026"
# (name, type, location, notes)
DEMO_PLANTS = [
    ("Lemon tree", "Lemon", "Back garden", "Planted in spring 2024. Gets the afternoon sun."),
    ("Balcony tomatoes", "Tomato", "Balcony planter", None),
    ("Damask rose", "Rose", "Front yard", "Pruned in February."),
    ("Fig tree", "Fig", "Courtyard", None),
    ("Mint pot", "Mint", "Kitchen window", None),
]

DEMO_GROWER_EMAIL = "grower@example.com"
DEMO_SPECIALIST_EMAIL = "specialist@example.com"
# Real IP102 test photos (never trained on), credited in content/demo/demo.json.
DEMO_DIR = BACKEND_DIR / "content" / "demo"

# (plant, days ago, photo, grower's notes)
DEMO_OBSERVATIONS = [
    ("Lemon tree", 2, "lemon-aphids.jpg", "Clusters of small dark insects under the new leaves. Some leaves are starting to curl."),
    ("Lemon tree", 12, "lemon-mealybugs.jpg", "White, cottony clumps where the leaves meet the stem."),
    ("Lemon tree", 20, "lemon-fruit-fly.jpg", "A yellow and brown fly resting on the leaves near the fruit."),
    ("Balcony tomatoes", 1, "tomato-whiteflies.jpg", "Tiny white insects fly up whenever I touch the plant."),
    ("Balcony tomatoes", 9, "tomato-caterpillar.jpg", "A caterpillar and fresh holes chewed in the leaves."),
    ("Damask rose", 4, "rose-aphids.jpg", "Insects packed around the new shoots."),
    ("Fig tree", 6, "fig-scale.jpg", "Hard bumps along a young branch. They don't move."),
    ("Mint pot", 3, "mint-unknown.jpg", "A spotted insect I haven't seen before."),
]

# One review in each state (US12-US16): (photo, grower's note, state)
DEMO_REVIEWS = [
    ("lemon-aphids.jpg", "They keep coming back on the new leaves. What are they, and should I spray?", "answered"),
    ("tomato-whiteflies.jpg", "Should I worry about these? There are more every week.", "waiting_for_grower"),
    ("mint-unknown.jpg", "Nabta couldn't tell what this is. Is it harmful to my mint?", "waiting_for_specialist"),
]
DEMO_QUESTION = (
    "Do the leaves feel sticky, and do the insects fly up when you brush the plant? "
    "A photo of the underside of a leaf would help."
)
DEMO_ASSESSMENT = FeedbackIn(
    outcome="identified",
    category_key="aphids",
    message=(
        "These are aphids, feeding on the soft new growth. Small numbers do little harm: rinse them off with "
        "a strong spray of water and leave the ladybirds and lacewings that eat them. Check the new leaves "
        "again in a week, and send a new photo if they come back in large numbers."
    ),
)


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


def _seed_observations(db: Session, grower, settings: Settings) -> dict[str, Observation]:
    """Photo observations for the demo plants, stored through the normal photo pipeline."""
    plants = {plant.name: plant for plant in db.scalars(select(Plant).where(Plant.owner_id == grower.id))}
    today = datetime.now(UTC).date()
    added = {}
    for plant_name, days_ago, photo, notes in DEMO_OBSERVATIONS:
        plant = plants.get(plant_name)
        if plant is None:
            continue
        added[photo] = observations.create(
            db,
            settings,
            plant,
            photo_data=(DEMO_DIR / photo).read_bytes(),
            observed_on=today - timedelta(days=days_ago),
            notes=notes,
            client_request_id=None,
        )
    return added


def _seed_analyses(db: Session, settings: Settings, seeded: dict[str, Observation]) -> int:
    """Nabta's suggestion for each demo photo, when a model is installed (US09)."""
    classifier = load_classifier(settings.model_dir)
    if classifier is None:
        return 0
    for observation in seeded.values():
        analysis.analyse(db, observation, classifier, settings)
    return len(seeded)


def _seed_reviews(db: Session, seeded: dict[str, Observation]) -> int:
    """A review waiting for a specialist, one waiting for the grower, and one answered."""
    specialist = users.find_by_email(db, DEMO_SPECIALIST_EMAIL)
    catalog = load_catalog()
    opened = 0
    for photo, note, state in DEMO_REVIEWS:
        observation = seeded.get(photo)
        if observation is None:
            continue
        case = reviews.request_review(db, observation, note)
        if state == "waiting_for_grower":
            reviews.ask(db, specialist, case, DEMO_QUESTION)
        elif state == "answered":
            reviews.give_feedback(db, specialist, case, DEMO_ASSESSMENT, catalog)
        opened += 1
    return opened


def _remove_demo_grower_data(db: Session, settings: Settings) -> int:
    """The demo grower's plants and everything on them; other accounts are untouched."""
    grower = users.find_by_email(db, DEMO_GROWER_EMAIL)
    if grower is None:
        return 0
    plants = db.scalars(select(Plant).where(Plant.owner_id == grower.id)).all()
    files = [
        name
        for photo, thumb in db.execute(
            select(Observation.photo_filename, Observation.thumb_filename).join(Plant).where(Plant.owner_id == grower.id)
        )
        for name in (photo, thumb)
    ]
    for plant in plants:
        db.delete(plant)  # observations, analyses, reviews and their notifications go with it
    db.commit()
    # Only once the rows are gone: a failed commit must not lose photos still referenced.
    photos.delete_files(settings.photos_dir, files)
    return len(plants)


def seed_demo(db: Session, settings: Settings, reset: bool = False) -> str:
    """Demo accounts, plants, real photo observations with Nabta's suggestions, and a review in
    each state. Running it again adds nothing twice; `reset` rebuilds the demo grower's data."""
    created = []
    if reset:
        removed = _remove_demo_grower_data(db, settings)
        created.append(f"Removed the demo grower's {removed} plants and everything on them")
    for email, name, role in (
        (DEMO_GROWER_EMAIL, "Sara Ahmed", Role.GROWER),
        (DEMO_SPECIALIST_EMAIL, "Khalid Alharbi", Role.SPECIALIST),
    ):
        if users.find_by_email(db, email) is None:
            users.create_user(db, email=email, full_name=name, password=DEMO_PASSWORD, role=role)
            created.append(email)

    grower = users.find_by_email(db, DEMO_GROWER_EMAIL)
    existing = set(db.scalars(select(Plant.name).where(Plant.owner_id == grower.id)))
    new_plants = [plant for plant in DEMO_PLANTS if plant[0] not in existing]
    for name, plant_type, location, notes in new_plants:
        db.add(Plant(owner_id=grower.id, name=name, plant_type=plant_type, location=location, notes=notes))
    if new_plants:
        created.append(f"{len(new_plants)} plants")
    db.commit()

    has_observations = db.scalars(
        select(Observation.id).join(Plant).where(Plant.owner_id == grower.id)
    ).first()
    if not has_observations:
        seeded = _seed_observations(db, grower, settings)
        if seeded:
            created.append(f"{len(seeded)} photo observations")
            if _seed_analyses(db, settings, seeded):
                created.append("Nabta's suggestions")
            opened = _seed_reviews(db, seeded)
            if opened:
                created.append(f"{opened} specialist reviews")
    if not created:
        return "Demo data already present; nothing changed."
    return f"{', '.join(created)}. Demo password: {DEMO_PASSWORD}"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description="Nabta team commands.")
    commands = parser.add_subparsers(dest="command", required=True)
    specialist = commands.add_parser("create-specialist", help="Create a plant specialist account.")
    specialist.add_argument("--email", required=True)
    specialist.add_argument("--name", required=True, help="Full name shown to growers.")
    specialist.add_argument("--password", help="Omit to be asked for it without echoing.")
    seed = commands.add_parser("seed-demo", help="Create demo accounts, plants, observations and reviews.")
    seed.add_argument(
        "--reset",
        action="store_true",
        help="First remove the demo grower's plants, observations and reviews (other accounts are untouched).",
    )
    return parser


def main(argv: list[str] | None = None, settings: Settings | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = settings or Settings()
    engine = create_db_engine(settings.database_url)
    db = create_session_factory(engine)()
    try:
        if args.command == "create-specialist":
            message = create_specialist(db, args.email, args.name, args.password)
        else:
            message = seed_demo(db, settings, reset=args.reset)
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
