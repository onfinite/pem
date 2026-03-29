from fastapi import FastAPI
from app.routers import router

app = FastAPI(title="PEM API", version="1.0.0")

app.include_router(router)
