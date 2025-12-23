from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from .proxy import router as proxy_router
from .v1 import v1_router
from .ws import ws_router

# Create a unified API router for /api
api_router = APIRouter(prefix="/api")
api_router.include_router(v1_router)

# Create a single root router to include all other routers
# Don't add tags here to avoid duplication in docs
root_router = APIRouter(prefix="/xyzen")


class HealthCheckResponse(BaseModel):
    """Health check response model"""

    status: str = Field(..., description="Service status", examples=["ok", "error"])
    message: str = Field(..., description="Status description message")

    model_config = ConfigDict(json_schema_extra={"examples": [{"status": "ok", "message": "Service is running"}]})


@api_router.get(
    "/health",
    tags=["health"],
    response_model=HealthCheckResponse,
    responses={
        200: {
            "description": "Service is running normally",
            "content": {
                "application/json": {
                    "examples": {
                        "healthy": {
                            "summary": "Healthy status",
                            "value": {"status": "ok", "message": "Service is running"},
                        }
                    }
                }
            },
        },
        503: {
            "description": "Service unavailable",
            "content": {
                "application/json": {
                    "examples": {
                        "unhealthy": {
                            "summary": "Unhealthy status",
                            "value": {"status": "error", "message": "Service is unavailable"},
                        },
                        "database_error": {
                            "summary": "Database connection failed",
                            "value": {"status": "error", "message": "Database connection failed"},
                        },
                    }
                }
            },
        },
    },
    summary="Health check",
    description="Verify the service is running properly, can be used for load balancers and monitoring systems",
)
async def health_check() -> HealthCheckResponse:
    """
    Health check endpoint to verify the service is running.

    Returns:
        HealthCheckResponse: Response object containing service status and message

    Raises:
        HTTPException: Returns 503 status code if service is unavailable
    """
    return HealthCheckResponse(status="ok", message="Service is running")


root_router.include_router(api_router)
root_router.include_router(ws_router)

# Include proxy router directly under /xyzen (not under /xyzen/api)
# This makes it accessible at /xyzen/api/bohrium/v1/... and /xyzen/api/openapi/v1/...
root_router.include_router(proxy_router)
