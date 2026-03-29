import sentry_sdk
import structlog
import logging
from app.core.config import settings


def setup_sentry():
    if settings.env == "prod":
        sentry_sdk.init(
            dsn=settings.sentry_sdk_dsn,
            send_default_pii=True,
            enable_logs=True,
            traces_sample_rate=1.0,
        )


def setup_logging():
    is_prod = settings.env == "prod"

    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
    ]

    if is_prod:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer())  # pretty in dev

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.INFO if is_prod else logging.DEBUG
        ),
    )


setup_sentry()
setup_logging()
