from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import auth, users

app = FastAPI(title="Conico PMS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
