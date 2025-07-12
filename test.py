from fastapi import APIRouter, FastAPI
from routers import *
from server import FastAPILabMCP
import uvicorn
from fastapi.openapi.utils import get_openapi

app = FastAPI()
app.include_router(labs_router)

@app.get(
    "/",
    operation_id="index",
    tags=["common"]
)
async def index():
    return {"message": "Hello World!"}

openapi_schema = get_openapi(
    title=app.title,
    version=app.version,
    openapi_version=app.openapi_version,
    description=app.description,
    routes=app.routes
)
import json
with open("openapi.json", "w") as f:
    json.dump(openapi_schema, f)
print("openapi.json saved")


