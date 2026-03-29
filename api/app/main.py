import app.core.bootstrap  # noqa
from contextlib import asynccontextmanager
from fastapi import FastAPI
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.middlewares.correlation_middleware import CorrelationIdMiddleware
from app.middlewares.cors import setup_cors
from app.middlewares.limiter import limiter
from app.middlewares.request_size_limit import RequestSizeLimitMiddleware
from app.middlewares.security_headers import SecurityHeadersMiddleware
from app.routers import router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup hooks go here
    yield
    # shutdown hooks go here


app = FastAPI(
    title="PEM API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.env != "prod" else None,
    redoc_url="/redoc" if settings.env != "prod" else None,
)

app.add_middleware(CorrelationIdMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestSizeLimitMiddleware, max_bytes=settings.max_request_size)

setup_cors(app)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok"}
