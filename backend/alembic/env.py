"""Alembic environment: migrates the database named in the app settings (NABTA_DATABASE_URL)."""

from logging.config import fileConfig

from alembic import context

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


def run_migrations_online() -> None:
    engine = create_db_engine(database_url)
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=True,
            render_item=render_item,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
