"""Alembic environment: migrates the database named in the app settings (NABTA_DATABASE_URL)."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import event

import app.models  # noqa: F401  (registers every table on Base.metadata)
from app.config import Settings
from app.db import Base, UTCDateTime, create_db_engine

config = context.config

# Keep loggers the application (or the test run) already configured.
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata

# Tests pass a URL explicitly; otherwise use the same settings as the app.
database_url = config.attributes.get("database_url") or Settings().database_url


def render_item(type_, obj, autogen_context):
    """Writes UTCDateTime columns as plain DateTime, so migrations don't import app code."""
    if type_ == "type" and isinstance(obj, UTCDateTime):
        return "sa.DateTime()"
    return False


class ForeignKeyCheckFailed(RuntimeError):
    """The migrated database has rows whose foreign keys point at nothing; nothing was saved."""


def run_migrations_offline() -> None:
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        render_as_batch=True,  # SQLite alters tables by copying them
        render_item=render_item,
    )
    with context.begin_transaction():
        context.run_migrations()


def _migration_engine():
    """The app's engine, set up for migrating SQLite safely (DEF-02).

    SQLite changes a table by copying it, dropping the old one and renaming the copy (Alembic's
    batch mode). With foreign keys on, as the app needs them, dropping `users` deletes every
    plant, observation and review that points at it (ON DELETE CASCADE). So for migrations:
      - foreign keys are off on this connection only (the running app keeps them on);
      - the whole upgrade runs in one real transaction, so a failure leaves the database as it was;
      - before committing, PRAGMA foreign_key_check must find nothing, or the upgrade is undone.
    """
    engine = create_db_engine(database_url)
    if engine.dialect.name != "sqlite":
        return engine

    @event.listens_for(engine, "connect")
    def _foreign_keys_off(dbapi_connection, _record) -> None:
        # Runs after the app's own listener, which turned foreign keys on. SQLite ignores this
        # pragma inside a transaction, so it is set here, before any transaction begins.
        dbapi_connection.isolation_level = None  # SQLAlchemy, not the driver, starts transactions
        dbapi_connection.execute("PRAGMA foreign_keys=OFF")

    @event.listens_for(engine, "begin")
    def _begin(connection) -> None:
        connection.exec_driver_sql("BEGIN")  # a real transaction that covers the DDL too

    return engine


def _check_foreign_keys(connection) -> None:
    problems = connection.exec_driver_sql("PRAGMA foreign_key_check").fetchall()
    if problems:
        listed = "; ".join(f"{table} row {rowid} -> {parent}" for table, rowid, parent, _fk in problems[:20])
        raise ForeignKeyCheckFailed(
            f"Migration undone: {len(problems)} rows would point at missing records ({listed})."
        )


def run_migrations_online() -> None:
    engine = _migration_engine()
    sqlite = engine.dialect.name == "sqlite"
    try:
        with engine.connect() as connection:
            if sqlite and connection.exec_driver_sql("PRAGMA foreign_keys").scalar() != 0:
                raise RuntimeError("Foreign keys must be off while SQLite tables are rebuilt.")
            if sqlite:
                connection.commit()  # ends the check's transaction before the migration's own
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                render_as_batch=True,
                render_item=render_item,
                compare_type=True,
                transactional_ddl=sqlite,  # every pending migration in one transaction, undone together
            )
            with context.begin_transaction():
                context.run_migrations()
                if sqlite:
                    _check_foreign_keys(connection)  # raising here rolls the whole upgrade back
            if sqlite:
                # Pragmas are per connection, so this one is closed next anyway; switched back on
                # so nothing that reuses it could ever write without foreign keys. Sent through
                # the driver, because SQLAlchemy would first open a transaction, inside which
                # SQLite ignores the pragma.
                raw = connection.connection.dbapi_connection
                raw.execute("PRAGMA foreign_keys=ON")
                if raw.execute("PRAGMA foreign_keys").fetchone()[0] != 1:
                    raise RuntimeError("Foreign keys could not be switched back on after migrating.")
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
