import logging
from typing import Optional

from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile, status
from pydantic import BaseModel

from app.core.auth.authentication import authentication_service
from app.middleware.auth import AuthProvider
from app.middleware.auth.casdoor import CasdoorAuthProvider

# 设置日志记录器
logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])


class LoginRequest(BaseModel):
    code: str
    state: Optional[str] = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user_info: Optional["UserInfoResponse"] = None


class AuthStatusResponse(BaseModel):
    """认证状态响应"""

    is_configured: bool
    provider: Optional[str] = None
    message: str


class AuthProviderConfigResponse(BaseModel):
    """当前后端所使用的认证提供商配置 (前端用于动态展示 OAuth 入口)"""

    provider: str
    issuer: Optional[str] = None
    audience: Optional[str] = None
    jwks_uri: Optional[str] = None
    algorithm: Optional[str] = None


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


class LinkedAccountResponse(BaseModel):
    """已绑定的第三方账户"""

    provider_name: str  # e.g., "custom", "github"
    provider_display_name: str  # e.g., "Bohrium", "GitHub"
    provider_icon_url: Optional[str] = None  # Provider icon URL
    user_id: str
    username: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    is_valid: Optional[bool] = None  # Token validation status


class LinkedAccountsResponse(BaseModel):
    """已绑定账户列表响应"""

    accounts: list[LinkedAccountResponse]


class LinkUrlResponse(BaseModel):
    """账户绑定 URL 响应"""

    url: str
    provider_type: str


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


@router.get("/config", response_model=AuthProviderConfigResponse)
async def get_auth_config() -> AuthProviderConfigResponse:
    """返回当前认证提供商的关键配置 (不含敏感密钥), 供前端构造登录入口

    字段说明:
    - provider: 当前使用的鉴权类型 (casdoor | bohrium | bohr_app)
    - issuer: OIDC / userinfo 根地址, Casdoor/Bohrium 用于拼装授权链接或 userinfo
    - audience: 对应客户端 ID (Casdoor 用作 client_id)
    - jwks_uri: 若为 JWT 提供商用于验证签名
    - algorithm: JWT 算法 (展示/调试用途)
    """
    provider = AuthProvider
    # BaseAuthProvider 暴露的字段
    return AuthProviderConfigResponse(
        provider=provider.get_provider_name(),
        issuer=getattr(provider, "issuer", None),
        audience=getattr(provider, "audience", None),
        jwks_uri=getattr(provider, "jwks_uri", None),
        algorithm=getattr(provider, "algorithm", None),
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
        logger.info(
            f"验证成功，用户信息: id={auth_result.user_info.id}, "
            f"username={auth_result.user_info.username}, "
            f"display_name={auth_result.user_info.display_name}, "
            f"avatar_url={auth_result.user_info.avatar_url}"
        )
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
async def get_current_user(
    authorization: Optional[str] = Header(None, description="Bearer token"),
) -> UserInfoResponse:
    """获取当前用户信息（需要有效的 token）"""

    # 先验证 token
    validation_result = await validate_token(authorization)

    if not validation_result.success or not validation_result.user_info:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=validation_result.error_message or "Token validation failed",
        )

    return validation_result.user_info


@router.post("/login/casdoor", response_model=LoginResponse)
async def login_casdoor(request: LoginRequest) -> LoginResponse:
    """Casdoor 授权码登录接口"""
    try:
        logger.info("收到 Casdoor 登录请求")
        result = authentication_service.login_with_code(request.code, request.state)

        user_info = None
        if result.get("user_info"):
            u = result["user_info"]
            user_info = UserInfoResponse(
                id=u.id,
                username=u.username,
                email=u.email,
                display_name=u.display_name,
                avatar_url=u.avatar_url,
                roles=u.roles,
            )

        return LoginResponse(
            access_token=result["access_token"],
            token_type=result["token_type"],
            user_info=user_info,
        )
    except Exception as e:
        logger.error(f"Login failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/linked-accounts", response_model=LinkedAccountsResponse)
async def get_linked_accounts(
    authorization: Optional[str] = Header(None, description="Bearer token"),
    validate: bool = Query(False, description="是否验证第三方 token 有效性"),
) -> LinkedAccountsResponse:
    """获取用户已绑定的第三方账户列表

    Args:
        validate: 是否验证每个第三方 token 的有效性（会增加响应时间）
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid authorization header")

    access_token = authorization[7:]
    provider = AuthProvider

    # 只有 Casdoor 支持此功能
    if not isinstance(provider, CasdoorAuthProvider):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Linked accounts feature is only available with Casdoor provider",
        )

    linked_accounts = provider.get_linked_accounts(access_token)

    # 如果需要验证 token 有效性
    if validate and linked_accounts:
        original_tokens = provider.get_original_tokens(access_token)
        for account in linked_accounts:
            if account.provider_name in original_tokens:
                account.is_valid = provider.validate_third_party_token(
                    account.provider_name, original_tokens[account.provider_name]
                )

    return LinkedAccountsResponse(
        accounts=[
            LinkedAccountResponse(
                provider_name=acc.provider_name,
                provider_display_name=acc.provider_display_name,
                provider_icon_url=acc.provider_icon_url,
                user_id=acc.user_id,
                username=acc.username,
                email=acc.email,
                avatar_url=acc.avatar_url,
                is_valid=acc.is_valid,
            )
            for acc in linked_accounts
        ]
    )


@router.get("/link-url", response_model=LinkUrlResponse)
async def get_link_url(
    provider_type: str = Query(..., description="Provider 类型，如 Custom, GitHub"),
    redirect_uri: str = Query(..., description="绑定完成后的回调地址"),
    authorization: Optional[str] = Header(None, description="Bearer token"),
) -> LinkUrlResponse:
    """获取第三方账户绑定 URL

    用于引导用户重新授权绑定第三方账户
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid authorization header")

    provider = AuthProvider

    if not isinstance(provider, CasdoorAuthProvider):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Link URL feature is only available with Casdoor provider",
        )

    url = provider.get_link_url(provider_type, redirect_uri)
    return LinkUrlResponse(url=url, provider_type=provider_type)


class AvatarUpdateResponse(BaseModel):
    """头像更新响应"""

    success: bool
    avatar_url: Optional[str] = None
    message: Optional[str] = None


@router.post("/avatar", response_model=AvatarUpdateResponse)
async def update_avatar(
    file: UploadFile = File(..., description="头像图片文件"),
    authorization: Optional[str] = Header(None, description="Bearer token"),
) -> AvatarUpdateResponse:
    """上传并更新用户头像

    支持的图片格式: PNG, JPG, JPEG, GIF, WebP
    文件大小限制: 5MB
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid authorization header")

    access_token = authorization[7:]
    provider = AuthProvider

    if not isinstance(provider, CasdoorAuthProvider):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Avatar update is only available with Casdoor provider",
        )

    # 验证文件类型
    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}",
        )

    # 读取文件内容
    file_data = await file.read()

    # 验证文件大小 (5MB)
    max_size = 5 * 1024 * 1024
    if len(file_data) > max_size:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds 5MB limit",
        )

    # 上传到 Casdoor
    avatar_url = provider.upload_avatar(
        access_token=access_token,
        file_data=file_data,
        filename=file.filename or "avatar.png",
        content_type=file.content_type or "image/png",
    )

    if not avatar_url:
        return AvatarUpdateResponse(success=False, message="Failed to upload avatar")

    # 更新用户头像 URL
    if not provider.update_user_avatar(access_token, avatar_url):
        return AvatarUpdateResponse(
            success=False, avatar_url=avatar_url, message="Avatar uploaded but failed to update user profile"
        )

    return AvatarUpdateResponse(success=True, avatar_url=avatar_url, message="Avatar updated successfully")


class DisplayNameUpdateRequest(BaseModel):
    """显示名称更新请求"""

    display_name: str


class DisplayNameUpdateResponse(BaseModel):
    """显示名称更新响应"""

    success: bool
    display_name: Optional[str] = None
    message: Optional[str] = None


@router.post("/display-name", response_model=DisplayNameUpdateResponse)
async def update_display_name(
    request: DisplayNameUpdateRequest,
    authorization: Optional[str] = Header(None, description="Bearer token"),
) -> DisplayNameUpdateResponse:
    """更新用户显示名称

    显示名称长度限制: 1-50 字符
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid authorization header")

    # 验证显示名称长度
    display_name = request.display_name.strip()
    if not display_name or len(display_name) < 1:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Display name cannot be empty")
    if len(display_name) > 50:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Display name cannot exceed 50 characters")

    access_token = authorization[7:]
    provider = AuthProvider

    if not isinstance(provider, CasdoorAuthProvider):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Display name update is only available with Casdoor provider",
        )

    # 更新显示名称
    if not provider.update_user_display_name(access_token, display_name):
        return DisplayNameUpdateResponse(success=False, message="Failed to update display name")

    return DisplayNameUpdateResponse(
        success=True, display_name=display_name, message="Display name updated successfully"
    )
