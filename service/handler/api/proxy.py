"""
API Proxy Router
处理第三方 API 的代理请求，解决 CORS 问题
"""

import logging
import os

import httpx
from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse, Response

from internal.configs import configs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["proxy"])

# 超时配置
TIMEOUT = httpx.Timeout(30.0, connect=10.0)


@router.api_route(
    "/bohrium/v1/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
)
async def proxy_bohrium(
    path: str,
    request: Request,
    access_key: str | None = Header(None, alias="accessKey"),
    x_app_key: str | None = Header(None, alias="x-app-key"),
) -> Response:
    """
    代理 Bohrium API 请求

    将前端的 /api/bohrium/v1/* 请求转发到 https://www.bohrium.com/bohrapi/v1/*
    """
    target_url = f"https://www.bohrium.com/bohrapi/v1/{path}"

    # 获取查询参数
    query_params = dict(request.query_params)

    # 构建请求头
    headers = {
        "Content-Type": "application/json",
        "Origin": "https://www.bohrium.com",
    }

    # 添加认证头（如果存在）
    if access_key:
        headers["accessKey"] = access_key
    if x_app_key:
        headers["x-app-key"] = x_app_key

    try:
        # 获取请求体（如果有）
        body = None
        if request.method in ["POST", "PUT", "PATCH"]:
            body = await request.body()

        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # 转发请求
            response = await client.request(
                method=request.method,
                url=target_url,
                params=query_params,
                headers=headers,
                content=body,
            )

            # 返回响应
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers={
                    "Content-Type": response.headers.get("Content-Type", "application/json"),
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                },
            )

    except httpx.TimeoutException:
        logger.error(f"Timeout when proxying to {target_url}")
        return JSONResponse(
            content={"error": "Request timeout"},
            status_code=504,
        )
    except Exception as e:
        logger.error(f"Error proxying to {target_url}: {e}")
        return JSONResponse(
            content={"error": str(e)},
            status_code=502,
        )


@router.api_route(
    "/smithery/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
)
async def proxy_smithery(
    path: str,
    request: Request,
    authorization: str | None = Header(None, alias="Authorization"),
) -> Response:
    """
    代理 Smithery Registry API 请求

    将前端的 /api/smithery/* 请求转发到 https://registry.smithery.ai/*
    """
    target_url = f"https://registry.smithery.ai/{path}"

    # 获取查询参数
    query_params = dict(request.query_params)

    # 构建请求头
    headers = {
        "Content-Type": "application/json",
        "Origin": "https://registry.smithery.ai",
    }

    if authorization:
        logger.warning("Authorization header from client is ignored; using server-configured Smithery key instead.")

    # Prefer backend config; fallback to env var
    token = None
    try:
        token = configs.MCP.Smithery.Key
    except Exception:
        token = None

    if not token:
        env_token = os.getenv("XYZEN_MCP_SMITHERY_KEY") or os.getenv("SMITHERY_API_KEY")
        if env_token:
            token = env_token

    if not token:
        logger.error(
            "Smithery key missing: configure configs.MCP.Smithery.Key or set XYZEN_MCP_SMITHERY_KEY/SMITHERY_API_KEY"
        )
    else:
        headers["Authorization"] = f"Bearer {token}"

    try:
        body = None
        if request.method in ["POST", "PUT", "PATCH"]:
            body = await request.body()

        logger.info(f"Proxying request to {target_url} with method {request.method}")
        logger.info(f"Headers: {headers}")
        logger.info(f"Query Params: {query_params}")

        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            response = await client.request(
                method=request.method,
                url=target_url,
                params=query_params,
                headers=headers,
                content=body,
            )

            return Response(
                content=response.content,
                status_code=response.status_code,
                headers={
                    "Content-Type": response.headers.get("Content-Type", "application/json"),
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                },
            )

    except httpx.TimeoutException:
        logger.error(f"Timeout when proxying to {target_url}")
        return JSONResponse(
            content={"error": "Request timeout"},
            status_code=504,
        )
    except Exception as e:
        logger.error(f"Error proxying to {target_url}: {e}")
        return JSONResponse(
            content={"error": str(e)},
            status_code=502,
        )


@router.api_route(
    "/openapi/v1/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
)
async def proxy_openapi(
    path: str,
    request: Request,
    access_key: str | None = Header(None, alias="accessKey"),
    x_app_key: str | None = Header(None, alias="x-app-key"),
) -> Response:
    """
    代理 Bohrium OpenAPI 请求

    将前端的 /api/openapi/v1/* 请求转发到 https://openapi.dp.tech/openapi/v1/*
    """
    target_url = f"https://openapi.dp.tech/openapi/v1/{path}"

    # 获取查询参数
    query_params = dict(request.query_params)

    # 构建请求头
    headers = {
        "Content-Type": "application/json",
        "Origin": "https://openapi.dp.tech",
    }

    # 添加认证头（如果存在）
    if access_key:
        headers["accessKey"] = access_key
    if x_app_key:
        headers["x-app-key"] = x_app_key

    try:
        # 获取请求体（如果有）
        body = None
        if request.method in ["POST", "PUT", "PATCH"]:
            body = await request.body()

        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # 转发请求
            response = await client.request(
                method=request.method,
                url=target_url,
                params=query_params,
                headers=headers,
                content=body,
            )

            # 返回响应
            return Response(
                content=response.content,
                status_code=response.status_code,
                headers={
                    "Content-Type": response.headers.get("Content-Type", "application/json"),
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                },
            )

    except httpx.TimeoutException:
        logger.error(f"Timeout when proxying to {target_url}")
        return JSONResponse(
            content={"error": "Request timeout"},
            status_code=504,
        )
    except Exception as e:
        logger.error(f"Error proxying to {target_url}: {e}")
        return JSONResponse(
            content={"error": str(e)},
            status_code=502,
        )
