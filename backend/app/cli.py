"""Team commands. Run from backend/:

    python -m app.cli create-specialist --email E --name N [--password P]
    python -m app.cli list-pending-specialists
    python -m app.cli approve-specialist --email E
    python -m app.cli revoke-specialist --email E [--release-cases]
    python -m app.cli backup-db [--out DIR] [--if-upgrade-pending]
    python -m app.cli restore-db --from FILE [--yes]
    python -m app.cli seed-demo [--reset]
    python -m app.cli export-research-photos --out DIR [--include-unchecked]
    python -m app.cli evaluate-collected --set DIR [--set DIR2] [--report PATH]
    python -m app.cli review-content --by NAME (--pest KEY ... | --all | --translation ar)

Both roles can also sign up on the website. A specialist who signs up there is pending and sees
no review cases until the team runs approve-specialist; create-specialist makes an approved account.
"""

import argparse
import getpass
import json
import sqlite3
import sys
from contextlib import closing
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from pydantic import ValidationError
from sqlalchemy import make_url, select
from sqlalchemy.orm import Session

from app.analysis.classifier import load_classifier
from app.config import BACKEND_DIR, Settings
from app.db import create_db_engine, create_session_factory, utcnow
from app.errors import ApiError
from app.models import CaseStatus, Note, Observation, Plant, ReviewCase, Role, Task, User
from app.pests import CONTENT_DIR, load_catalog
from app.schemas.reviews import FeedbackIn
from app.schemas.users import RegisterIn
from app.services import analysis, observations, photos, research, reviews, users

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


# Follow-up (US17-US19). Tasks: (plant, title or a guidance step "pest:index", due in days or None,
# done, photo it follows up). A step from the pest guide keeps its pest.
DEMO_TASKS = [
    ("Lemon tree", "aphids:0", -1, False, "lemon-aphids.jpg"),
    ("Lemon tree", "aphids:2", 0, False, "lemon-aphids.jpg"),
    ("Balcony tomatoes", "whiteflies:0", 3, False, "tomato-whiteflies.jpg"),
    ("Fig tree", "Cut off the branch with the most scale", None, False, None),
    ("Damask rose", "Look for ladybirds on the new shoots", None, True, None),
]
# (plant, days ago, note)
DEMO_NOTES = [
    ("Lemon tree", 5, "Watered deeply after a hot week. The new leaves look healthier."),
    ("Lemon tree", 15, "Fed with citrus fertiliser."),
    ("Balcony tomatoes", 2, "Removed the two lowest leaves; they had holes in them."),
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
            approved=True,  # the team's own account: approved from the start
        )
    except ApiError:
        raise CommandError(f"An account for {details.email} already exists.") from None
    db.commit()
    return f"Created approved specialist account {user.email} ({user.full_name})."


# Specialist approval (FR03, FR12, NFR05, NFR06) ------------------------------------------------


def _specialist(db: Session, email: str) -> User:
    user = users.find_by_email(db, email)
    if user is None:
        raise CommandError(f"There is no account for {users.normalize_email(email)}.")
    if user.role != Role.SPECIALIST:
        raise CommandError(f"{user.email} is a {user.role} account, not a specialist.")
    return user


def list_pending_specialists(db: Session) -> str:
    pending = db.scalars(
        select(User)
        .where(User.role == Role.SPECIALIST, User.approved_at.is_(None))
        .order_by(User.created_at, User.id)
    ).all()
    if not pending:
        return "No specialist accounts are waiting for approval."
    lines = [f"{len(pending)} specialist account(s) waiting for approval:"]
    lines += [f"  {user.email}  {user.full_name}  (signed up {user.created_at:%Y-%m-%d})" for user in pending]
    lines.append("Approve one with: python -m app.cli approve-specialist --email EMAIL")
    return "\n".join(lines)


def approve_specialist(db: Session, email: str) -> str:
    user = _specialist(db, email)
    if user.approved_at is not None:
        return f"{user.email} ({user.full_name}) was already approved on {user.approved_at:%Y-%m-%d}."
    user.approved_at = utcnow()
    db.commit()
    return f"Approved specialist {user.email} ({user.full_name}). They can now see review cases."


def revoke_specialist(db: Session, email: str, release_cases: bool) -> str:
    user = _specialist(db, email)
    held = db.scalars(
        select(ReviewCase).where(ReviewCase.specialist_id == user.id, ReviewCase.status != CaseStatus.ANSWERED)
    ).all()
    was_approved = user.approved_at is not None
    user.approved_at = None
    if release_cases:
        for case in held:
            case.specialist_id = None  # back in the queue for another specialist
            case.updated_at = utcnow()
    db.commit()
    message = (
        f"{user.email} ({user.full_name}) is pending again and can no longer see review cases."
        if was_approved
        else f"{user.email} ({user.full_name}) was already pending."
    )
    if held and release_cases:
        message += f" Returned their {len(held)} open case(s) to the queue."
    elif held:
        message += (
            f" They still hold {len(held)} open case(s); no other specialist can take them. "
            "Run again with --release-cases to return them to the queue."
        )
    return message


# Database backup and restore (supervisor review DEF-02) ------------------------------------------


def _sqlite_path(settings: Settings) -> Path:
    url = make_url(settings.database_url)
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        raise CommandError("backup-db and restore-db work on the SQLite database file only.")
    return Path(url.database).resolve()


def _table_counts(connection: sqlite3.Connection) -> dict[str, int]:
    tables = [row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
    return {table: connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] for table in tables}


def _revision(connection: sqlite3.Connection) -> str | None:
    try:
        row = connection.execute("SELECT version_num FROM alembic_version").fetchone()
    except sqlite3.Error:
        return None
    return row[0] if row else None


def _head_revision() -> str:
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return ScriptDirectory.from_config(config).get_current_head()


def _copy_database(source: Path, target: Path) -> dict[str, int]:
    """A consistent copy through SQLite's online backup, with the write-ahead log folded in first.
    The copy is one self-contained file (no -wal or -shm). Returns its row counts per table."""
    with closing(sqlite3.connect(source)) as live, closing(sqlite3.connect(target)) as copy:
        live.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        live.backup(copy)
        copy.execute("PRAGMA journal_mode=DELETE")
        if copy.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise CommandError(f"The copy at {target} failed SQLite's integrity check.")
        return _table_counts(copy)


def _counts_text(counts: dict[str, int]) -> str:
    return ", ".join(f"{table} {rows}" for table, rows in counts.items() if table != "alembic_version")


def backup_db(settings: Settings, out_dir: Path | None, if_upgrade_pending: bool) -> str:
    """Run before `alembic upgrade head` on real data."""
    database = _sqlite_path(settings)
    if not database.is_file():
        if if_upgrade_pending:
            return f"No database at {database} yet; nothing to back up."
        raise CommandError(f"There is no database at {database}.")
    with closing(sqlite3.connect(f"file:{database}?mode=ro", uri=True)) as connection:
        revision = _revision(connection)
    if if_upgrade_pending and revision == _head_revision():
        return f"The database is already at the newest revision ({revision}); no backup needed."
    out_dir = (out_dir or database.parent / "backups").resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    target = out_dir / f"{database.stem}-{stamp}-{revision or 'unversioned'}.db"
    if target.exists():
        raise CommandError(f"{target} already exists.")
    counts = _copy_database(database, target)
    return (
        f"Backed up {database} (revision {revision}) to {target}.\n"
        f"Rows: {_counts_text(counts)}.\n"
        f"Photos are not in the database: copy {settings.photos_dir} as well for a full backup.\n"
        f"To undo an upgrade: stop the app, then run  python -m app.cli restore-db --from \"{target}\""
    )


def restore_db(settings: Settings, backup: Path, assume_yes: bool) -> str:
    """Puts a backup made by backup-db back in place of the live database. Stop the app first."""
    database = _sqlite_path(settings)
    backup = backup.resolve()
    if not backup.is_file():
        raise CommandError(f"There is no backup at {backup}.")
    with closing(sqlite3.connect(f"file:{backup}?mode=ro", uri=True)) as source:
        if source.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise CommandError(f"{backup} failed SQLite's integrity check; nothing was changed.")
        expected = _table_counts(source)
        revision = _revision(source)
    if not assume_yes:
        answer = input(f"Replace {database} with {backup} (revision {revision})? Stop the app first. [y/N] ")
        if answer.strip().lower() not in ("y", "yes"):
            raise CommandError("Nothing was changed.")
    safety = None
    if database.is_file():
        # The database being replaced is kept too, so a restore can itself be undone.
        safety = database.parent / "backups" / f"{database.stem}-before-restore-{datetime.now(UTC):%Y%m%dT%H%M%SZ}.db"
        safety.parent.mkdir(parents=True, exist_ok=True)
        _copy_database(database, safety)
    with closing(sqlite3.connect(f"file:{backup}?mode=ro", uri=True)) as source, closing(sqlite3.connect(database)) as live:
        source.backup(live)  # through SQLite, so the live write-ahead log is handled correctly
        live.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        restored = _table_counts(live)
    if restored != expected:
        raise CommandError(f"The restored database does not match the backup: {restored} != {expected}.")
    kept = f" The database it replaced was saved to {safety}." if safety else ""
    return f"Restored {database} from {backup} (revision {revision}). Rows: {_counts_text(restored)}.{kept}"


def export_research_photos(db: Session, settings: Settings, out_dir: Path, include_unchecked: bool) -> str:
    out_dir = out_dir.resolve()
    if out_dir.is_relative_to(BACKEND_DIR.parent.resolve()):
        raise CommandError("Choose a folder outside the repository, so growers' photos are never committed.")
    done = research.export_research_set(db, settings, out_dir, include_unchecked)
    return (
        f"Exported {done.photos} photos from {done.growers} growers who agreed to research use "
        f"({done.checked} identified by a specialist, {done.unsupported} of them outside Nabta's categories) "
        f"to {out_dir}. Fill in the conditions column of {research.MANIFEST}, then run evaluate-collected."
    )


def review_content(reviewer: str, pests: list[str], review_all: bool, translation: str | None) -> str:
    """Records a reviewer's sign-off in the pest content (NFR14), so the pages stop saying it's awaited."""
    reviewer = reviewer.strip()
    if not reviewer:
        raise CommandError("Give the reviewer's name with --by.")
    path = CONTENT_DIR / "catalog.json"
    raw = json.loads(path.read_text(encoding="utf-8"))
    signed = {"status": "reviewed", "reviewed_by": reviewer, "reviewed_on": date.today().isoformat()}
    if translation:
        if translation not in raw.get("translations", {}):
            raise CommandError(f"There is no {translation!r} translation.")
        raw["translations"][translation].update(signed)
        done = f"the {translation} translation"
    else:
        entries = {entry["key"]: entry for entry in raw["pests"]}
        keys = list(entries) if review_all else pests
        unknown = [key for key in keys if key not in entries]
        if not keys or unknown:
            raise CommandError(f"Name pests with --pest (or use --all). Known: {', '.join(entries)}.")
        for key in keys:
            entries[key]["review"] = signed
        done = ", ".join(keys)
    path.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    load_catalog(CONTENT_DIR)  # still valid
    return f"Marked {done} as reviewed by {reviewer} on {signed['reviewed_on']}. Restart the backend to show it."


def evaluate_collected(settings: Settings, set_dirs: list[Path], report: Path | None) -> str:
    classifier = load_classifier(settings.model_dir)
    if classifier is None:
        raise CommandError(f"No pest model is installed in {settings.model_dir}; see ml/README.md.")
    try:
        text = research.evaluate_collected(classifier, set_dirs, date.today())
    except ValueError as error:
        raise CommandError(str(error)) from None
    report = report or set_dirs[0] / "report.md"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(text, encoding="utf-8")
    return f"Wrote {report}."


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


def _seed_followup(db: Session, grower, seeded: dict[str, Observation]) -> int:
    """Tasks in each state (overdue, due today, coming up, undated, done) and a few dated notes."""
    plants = {plant.name: plant for plant in db.scalars(select(Plant).where(Plant.owner_id == grower.id))}
    catalog = load_catalog()
    today = datetime.now(UTC).date()
    added = 0
    for plant_name, title, due_in, done, photo in DEMO_TASKS:
        plant = plants.get(plant_name)
        if plant is None:
            continue
        pest_key = None
        if ":" in title:
            pest_key, step = title.split(":")
            title = catalog.get(pest_key).guidance[int(step)].task
        observation = seeded.get(photo)
        db.add(
            Task(
                plant_id=plant.id,
                observation_id=observation.id if observation else None,
                pest_key=pest_key,
                title=title,
                due_on=today + timedelta(days=due_in) if due_in is not None else None,
                done_at=utcnow() if done else None,
            )
        )
        added += 1
    for plant_name, days_ago, body in DEMO_NOTES:
        if plant_name in plants:
            db.add(Note(plant_id=plants[plant_name].id, noted_on=today - timedelta(days=days_ago), body=body))
            added += 1
    db.commit()
    return added


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
        db.delete(plant)  # observations, analyses, reviews, tasks, notes and notifications go with it
    db.commit()
    # Only once the rows are gone: a failed commit must not lose photos still referenced.
    photos.delete_files(settings.photos_dir, files)
    return len(plants)


def seed_demo(db: Session, settings: Settings, reset: bool = False) -> str:
    """Demo accounts, plants, real photo observations with Nabta's suggestions, a review in each
    state, and tasks and notes. Running it again adds nothing twice; `reset` rebuilds the demo
    grower's data."""
    created = []
    if reset:
        removed = _remove_demo_grower_data(db, settings)
        created.append(f"Removed the demo grower's {removed} plants and everything on them")
    for email, name, role in (
        (DEMO_GROWER_EMAIL, "Sara Ahmed", Role.GROWER),
        (DEMO_SPECIALIST_EMAIL, "Khalid Alharbi", Role.SPECIALIST),
    ):
        if users.find_by_email(db, email) is None:
            # The demo specialist is one of the team's own accounts, so it is approved.
            users.create_user(db, email=email, full_name=name, password=DEMO_PASSWORD, role=role, approved=True)
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
            if _seed_followup(db, grower, seeded):
                created.append("tasks and notes")
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
    commands.add_parser(
        "list-pending-specialists", help="List specialist accounts waiting for the team's approval (names and emails)."
    )
    approve = commands.add_parser("approve-specialist", help="Let a specialist account see review cases.")
    approve.add_argument("--email", required=True)
    revoke = commands.add_parser(
        "revoke-specialist", help="Set a specialist account back to pending: no review cases until approved again."
    )
    revoke.add_argument("--email", required=True)
    revoke.add_argument(
        "--release-cases", action="store_true", help="Return their open cases to the queue for another specialist."
    )
    backup = commands.add_parser(
        "backup-db", help="Write a timestamped copy of the database. Run it before `alembic upgrade head`."
    )
    backup.add_argument("--out", type=Path, help="Folder for the copy (default: storage/backups next to the database).")
    backup.add_argument(
        "--if-upgrade-pending",
        action="store_true",
        help="Only back up when the database exists and `alembic upgrade head` would change it.",
    )
    restore = commands.add_parser(
        "restore-db", help="Put a backup from backup-db back in place of the database. Stop the app first."
    )
    restore.add_argument("--from", dest="backup", required=True, type=Path, help="The backup file.")
    restore.add_argument("--yes", action="store_true", help="Don't ask for confirmation.")
    seed = commands.add_parser("seed-demo", help="Create demo accounts, plants, observations and reviews.")
    seed.add_argument(
        "--reset",
        action="store_true",
        help="First remove the demo grower's plants, observations and reviews (other accounts are untouched).",
    )
    export = commands.add_parser(
        "export-research-photos",
        help="Copy the photos of growers who agreed to research use, with specialist-checked labels (charter §22.2).",
    )
    export.add_argument("--out", required=True, type=Path, help="A folder outside the repository.")
    export.add_argument(
        "--include-unchecked",
        action="store_true",
        help="Also copy photos no specialist has identified yet, with an empty category for a reviewer to fill in.",
    )
    evaluate = commands.add_parser(
        "evaluate-collected", help="Measure the installed model on growers' photos, apart from the benchmark (§8)."
    )
    evaluate.add_argument(
        "--set", dest="sets", action="append", required=True, type=Path, help="A folder with manifest.csv; repeatable."
    )
    evaluate.add_argument("--report", type=Path, help="Where to write the report (default: report.md in the first set).")
    review = commands.add_parser(
        "review-content", help="Record that a specialist reviewed pest pages, or a native speaker a translation."
    )
    review.add_argument("--by", required=True, help="The reviewer's name, shown on the pest pages.")
    which = review.add_mutually_exclusive_group(required=True)
    which.add_argument("--pest", dest="pests", action="append", default=[], help="A pest key; repeatable.")
    which.add_argument("--all", action="store_true", help="Every pest page.")
    which.add_argument("--translation", choices=["ar"], help="The Arabic interface text and pest content.")
    return parser


def main(argv: list[str] | None = None, settings: Settings | None = None) -> int:
    args = build_parser().parse_args(argv)
    settings = settings or Settings()
    engine = create_db_engine(settings.database_url)
    db = create_session_factory(engine)()
    try:
        if args.command == "create-specialist":
            message = create_specialist(db, args.email, args.name, args.password)
        elif args.command == "list-pending-specialists":
            message = list_pending_specialists(db)
        elif args.command == "approve-specialist":
            message = approve_specialist(db, args.email)
        elif args.command == "revoke-specialist":
            message = revoke_specialist(db, args.email, args.release_cases)
        elif args.command == "backup-db":
            message = backup_db(settings, args.out, args.if_upgrade_pending)
        elif args.command == "restore-db":
            message = restore_db(settings, args.backup, args.yes)
        elif args.command == "export-research-photos":
            message = export_research_photos(db, settings, args.out, args.include_unchecked)
        elif args.command == "evaluate-collected":
            message = evaluate_collected(settings, args.sets, args.report)
        elif args.command == "review-content":
            message = review_content(args.by, args.pests, args.all, args.translation)
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
