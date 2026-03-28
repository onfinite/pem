from fastapi import FastAPI
from app.modules.users.router import router as users_router

app = FastAPI(title="PEM API", version="1.0.0")


@app.get("/")
async def root():
    return {"message": "Hello World"}


app.include_router(users_router, prefix="/users", tags=["users"])
