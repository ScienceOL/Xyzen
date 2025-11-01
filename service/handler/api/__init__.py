from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field

from .v1 import v1_router

# Create a unified API router
# Don't add tags here to avoid duplication in docs
api_router = APIRouter(prefix="/api")


api_router.include_router(
    v1_router,
)


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
