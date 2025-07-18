from fastapi import APIRouter

r = APIRouter(
    prefix="/chat",
)


@r.get("/")
async def root() -> dict[str, str]:
    return {"message": "Chat API is running"}
