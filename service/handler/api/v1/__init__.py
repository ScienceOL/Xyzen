from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from .agents import router as agents_router
from .auth import router as auth_router
from .mcps import router as mcps_router
from .providers import router as providers_router
from .sessions import router as sessions_router
from .topics import router as topics_router

# Don't add tags here to avoid duplication in docs
v1_router = APIRouter(
    prefix="/v1",
)


class RootResponse(BaseModel):
    """API v1 root endpoint response"""

    message: str = Field(..., description="Welcome message")

    model_config = ConfigDict(json_schema_extra={"examples": [{"message": "Welcome to the API v1"}]})


@v1_router.get(
    "/",
    tags=["v1"],
    response_model=RootResponse,
    responses={
        200: {
            "description": "Successfully returned welcome message",
            "content": {
                "application/json": {
                    "examples": {
                        "success": {
                            "summary": "Success example",
                            "value": {"message": "Welcome to the API v1"},
                        }
                    }
                }
            },
        },
        500: {
            "description": "Internal server error",
            "content": {
                "application/json": {
                    "examples": {
                        "error": {
                            "summary": "Server error example",
                            "value": {"detail": "Internal server error"},
                        }
                    }
                }
            },
        },
    },
    summary="API v1 welcome endpoint",
    description="Returns API v1 welcome message to verify the API is running properly",
)
async def root() -> RootResponse:
    """
    API v1 root endpoint

    Returns welcome message to confirm API v1 is running properly.

    Returns:
        RootResponse: Response object containing welcome message
    """
    return RootResponse(message="Welcome to the API v1")


# Don't add tags in include_router, let each router define its own tags
v1_router.include_router(auth_router, prefix="/auth")
v1_router.include_router(providers_router, prefix="/providers")
v1_router.include_router(sessions_router, prefix="/sessions")
v1_router.include_router(topics_router, prefix="/topics")
v1_router.include_router(agents_router, prefix="/agents")
v1_router.include_router(mcps_router, prefix="/mcps")
