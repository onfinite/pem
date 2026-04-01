from fastapi import APIRouter

from app.routers.user_routes import router as users_router
from app.routers.clerk_webhook_routes import router as clerk_webhook_routes

router = APIRouter()
router.include_router(clerk_webhook_routes)
router.include_router(users_router)
