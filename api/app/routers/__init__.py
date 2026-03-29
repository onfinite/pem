from fastapi import APIRouter
from app.routers.user_routes import router as users_router

router = APIRouter()
router.include_router(users_router)
