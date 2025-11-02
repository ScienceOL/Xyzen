import logging
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from middleware.auth import AuthProvider

# 设置日志记录器
logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])


class AuthStatusResponse(BaseModel):
    """认证状态响应"""

    is_configured: bool
    provider: Optional[str] = None
    message: str


class UserInfoResponse(BaseModel):
    """用户信息响应"""

    id: str
    username: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    roles: Optional[list] = None


class AuthValidationResponse(BaseModel):
    """认证验证响应"""

    success: bool
    user_info: Optional[UserInfoResponse] = None
    error_message: Optional[str] = None
    error_code: Optional[str] = None


@router.get("/status", response_model=AuthStatusResponse)
async def get_auth_status() -> AuthStatusResponse:
    """获取认证服务配置状态"""

    provider = AuthProvider  # 使用全局的 AuthProvider 实例

    logger.info(f"认证服务已配置，使用提供商: {provider.get_provider_name()}")
    return AuthStatusResponse(
        is_configured=True,
        provider=provider.get_provider_name(),
        message=f"认证服务已配置 ({provider.get_provider_name()})",
    )


@router.post("/validate", response_model=AuthValidationResponse)
async def validate_token(
    authorization: Optional[str] = Header(None, description="Bearer token"),
) -> AuthValidationResponse:
    """验证 access_token 并返回用户信息"""
    logger.info("开始验证 access_token")

    # 检查 Authorization header
    if not authorization:
        logger.warning("缺少 Authorization header")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")

    logger.info(f"收到 Authorization header: {authorization[:20]}..." if len(authorization) > 20 else authorization)

    # 解析 Bearer token
    if not authorization.startswith("Bearer "):
        logger.warning("Authorization header 格式无效，不是 Bearer 格式")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header format")

    access_token = authorization[7:]  # Remove "Bearer " prefix
    logger.info(f"解析得到 access_token (前20字符): {access_token[:20]}...")

    # 获取认证提供商并验证 token
    provider = AuthProvider

    if not provider:
        logger.error("认证提供商初始化失败")
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="认证提供商初始化失败")

    logger.info(f"使用认证提供商: {provider.get_provider_name()}")

    logger.info("开始调用提供商验证token...")
    auth_result = provider.validate_token(access_token)
    logger.info(
        f"提供商验证结果: success={auth_result.success}, "
        f"error_code={auth_result.error_code}, error_message={auth_result.error_message}"
    )

    if not auth_result.success:
        logger.warning(f"Token验证失败: {auth_result.error_message} (code: {auth_result.error_code})")
        return AuthValidationResponse(
            success=False, error_code=auth_result.error_code, error_message=auth_result.error_message
        )

    # 转换用户信息格式
    user_info = None
    if auth_result.user_info:
        logger.info(f"验证成功，用户信息: id={auth_result.user_info.id}, username={auth_result.user_info.username}")
        user_info = UserInfoResponse(
            id=auth_result.user_info.id,
            username=auth_result.user_info.username,
            email=auth_result.user_info.email,
            display_name=auth_result.user_info.display_name,
            avatar_url=auth_result.user_info.avatar_url,
            roles=auth_result.user_info.roles,
        )
    else:
        logger.warning("验证成功但没有用户信息")

    logger.info("Token验证完成，返回成功结果")
    return AuthValidationResponse(success=True, user_info=user_info)


@router.get("/me", response_model=UserInfoResponse)
async def get_current_user(authorization: Optional[str] = Header(None, description="Bearer token")) -> UserInfoResponse:
    """获取当前用户信息（需要有效的 token）"""

    # 先验证 token
    validation_result = await validate_token(authorization)

    if not validation_result.success or not validation_result.user_info:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=validation_result.error_message or "Token validation failed",
        )

    return validation_result.user_info
