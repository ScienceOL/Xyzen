import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel

from app.core.auth.authentication import authentication_service
from app.core.rate_limit import (
    enforce_login_code_rate_limit,
    enforce_password_login_rate_limit,
    enforce_send_code_rate_limit,
    enforce_signup_rate_limit,
)
from app.middleware.auth import AuthProvider
from app.middleware.auth.casdoor import CasdoorAuthProvider

# 设置日志记录器
logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])


_GMAIL_DOMAINS = {"gmail.com", "googlemail.com"}


def _normalize_email(email: str) -> str:
    """Normalize email to a canonical form.

    - Lowercase the domain.
    - For Gmail/Googlemail: strip dots from the local part (Gmail ignores them).
    """
    local, _, domain = email.partition("@")
    if not domain:
        return email
    domain = domain.lower()
    if domain in _GMAIL_DOMAINS:
        local = local.replace(".", "")
    return f"{local}@{domain}"


def _validate_email_format(email: str) -> None:
    """Reject email addresses with + subaddressing (bulk registration vector)."""
    local_part = email.split("@")[0] if "@" in email else ""
    if "+" in local_part:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email addresses with + are not allowed",
        )


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
    organization: Optional[str] = None
    application: Optional[str] = None
    turnstile_site_key: Optional[str] = None


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
    from app.configs import configs

    provider = AuthProvider
    turnstile_key = configs.Auth.TurnstileSiteKey or None
    # BaseAuthProvider 暴露的字段
    return AuthProviderConfigResponse(
        provider=provider.get_provider_name(),
        issuer=getattr(provider, "issuer", None),
        audience=getattr(provider, "audience", None),
        jwks_uri=getattr(provider, "jwks_uri", None),
        algorithm=getattr(provider, "algorithm", None),
        organization=getattr(provider.config, "Organization", None),
        application=getattr(provider.config, "Application", None),
        turnstile_site_key=turnstile_key,
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

    # Fire-and-forget: ensure Novu subscriber exists (never blocks auth)
    if user_info:
        try:
            from app.core.notification.service import NotificationService

            NotificationService().ensure_subscriber(
                user_id=user_info.id,
                email=user_info.email,
                name=user_info.display_name,
            )
        except Exception:
            pass

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


class SendCodeRequest(BaseModel):
    email: str
    captcha_token: str | None = None


class SendCodeResponse(BaseModel):
    status: str
    action: str  # "login" or "signup"


def _verify_turnstile_token(token: str, secret: str) -> bool:
    """Verify a Cloudflare Turnstile token. Returns True if valid."""
    import requests as http_requests

    try:
        resp = http_requests.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": secret, "response": token},
            timeout=5,
        )
        data = resp.json()
        return bool(data.get("success"))
    except Exception:
        logger.warning("Turnstile verification request failed")
        return False


def _send_casdoor_code(api_base: str, email: str, app_id: str, method: str, client_secret: str) -> dict:
    """Low-level helper: POST to Casdoor send-verification-code and return parsed JSON."""
    import requests as http_requests

    resp = http_requests.post(
        f"{api_base}/api/send-verification-code",
        data={
            "dest": email,
            "type": "email",
            "applicationId": app_id,
            "method": method,
            "captchaType": "none",
            "captchaToken": "",
            "clientSecret": client_secret,
        },
        timeout=10,
    )
    return resp.json()


def _find_user_email(api_base: str, org: str, email: str, client_id: str, client_secret: str) -> str | None:
    """Find the stored email for a user in Casdoor.

    Tries the exact email first.  For Gmail addresses, also tries the
    normalized form (dots stripped) to handle dot-alias mismatches.
    Returns the email as stored in Casdoor, or None if not found.
    """
    import requests as http_requests

    def _query(addr: str) -> str | None:
        resp = http_requests.get(
            f"{api_base}/api/get-users",
            params={
                "owner": org,
                "field": "email",
                "value": addr,
                "pageSize": "10",
                "clientId": client_id,
                "clientSecret": client_secret,
            },
            timeout=10,
        )
        data = resp.json()
        users = data.get("data") or []
        # Casdoor may ignore field/value filters and return all users,
        # so we must verify the returned email actually matches our query.
        addr_lower = addr.lower()
        addr_normalized = _normalize_email(addr)
        for user in users:
            stored = user.get("email", "")
            if stored.lower() == addr_lower:
                return stored
            if _normalize_email(stored) == addr_normalized:
                return stored
        return None

    found = _query(email)
    if found:
        return found
    # Fallback: try normalized form for Gmail dot-alias issues
    normalized = _normalize_email(email)
    if normalized != email:
        return _query(normalized)
    return None


@router.post("/send-code", response_model=SendCodeResponse)
async def send_verification_code(
    request: SendCodeRequest, _: None = Depends(enforce_send_code_rate_limit)
) -> SendCodeResponse:
    """Send a verification code to the given email via Casdoor.

    Tries method=login first. If Casdoor responds with "user does not exist",
    automatically retries with method=signup and returns action="signup" so the
    frontend can show a registration form.
    """
    _validate_email_format(request.email)

    # Verify Turnstile CAPTCHA if token provided and secret configured
    if request.captcha_token:
        from app.configs import configs

        turnstile_secret = configs.Auth.TurnstileSecret
        if turnstile_secret and not _verify_turnstile_token(request.captcha_token, turnstile_secret):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CAPTCHA verification failed")

    provider = AuthProvider

    if not isinstance(provider, CasdoorAuthProvider):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Verification code login is only available with Casdoor provider",
        )

    org = getattr(provider.config, "Organization", None)
    app = getattr(provider.config, "Application", None)
    if not org or not app:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: Organization or Application missing",
        )

    client_secret = getattr(provider.config, "ClientSecret", None) or ""
    app_id = f"admin/{app}"

    try:
        # 1. Check if user exists (no code sent for existing users — they use password login)
        found_email = _find_user_email(provider.api_base, org, request.email, provider.audience, client_secret)

        if found_email:
            return SendCodeResponse(status="ok", action="login")

        # 2. New user — send signup verification code (use normalized email)
        normalized_email = _normalize_email(request.email)
        data = _send_casdoor_code(provider.api_base, normalized_email, app_id, "signup", client_secret)

        if data.get("status") == "ok":
            return SendCodeResponse(status="ok", action="signup")

        detail = data.get("msg") or data.get("message") or "Failed to send verification code"
        logger.warning(f"Casdoor send-code (signup) failed: {detail}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Send verification code failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


class SignupRequest(BaseModel):
    email: str
    password: str
    code: str


@router.post("/signup", response_model=LoginResponse)
async def signup(request: SignupRequest, _: None = Depends(enforce_signup_rate_limit)) -> LoginResponse:
    """Register a new user via Casdoor and return an access token.

    Username is derived from the email prefix. After Casdoor creates the user,
    the returned auth code is exchanged for an access token.
    """
    _validate_email_format(request.email)

    provider = AuthProvider

    if not isinstance(provider, CasdoorAuthProvider):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Signup is only available with Casdoor provider",
        )

    org = getattr(provider.config, "Organization", None)
    app = getattr(provider.config, "Application", None)
    if not org or not app:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: Organization or Application missing",
        )

    normalized_email = _normalize_email(request.email)
    username = normalized_email.split("@")[0]

    try:
        import requests as http_requests

        # Step 1: Register user via Casdoor
        signup_resp = http_requests.post(
            f"{provider.api_base}/api/signup",
            json={
                "organization": org,
                "application": app,
                "username": username,
                "name": username,
                "email": normalized_email,
                "password": request.password,
                "emailCode": request.code,
            },
            timeout=10,
        )
        signup_data = signup_resp.json()

        if signup_data.get("status") != "ok":
            detail = signup_data.get("msg") or signup_data.get("message") or "Signup failed"
            logger.warning(f"Casdoor signup failed: {detail}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

        # Step 2: Exchange auth code for access token (fallback: password grant)
        access_token: str | None = None
        auth_code = signup_data.get("data")
        if auth_code:
            try:
                access_token = provider.exchange_code_for_token(auth_code)
            except Exception as exc:
                logger.warning(f"Code exchange after signup failed, trying password grant: {exc}")

        if not access_token:
            client_secret = getattr(provider.config, "ClientSecret", None) or ""
            token_resp = http_requests.post(
                f"{provider.api_base}/api/login/oauth/access_token",
                data={
                    "grant_type": "password",
                    "client_id": provider.audience,
                    "client_secret": client_secret,
                    "username": username,
                    "password": request.password,
                    "scope": "openid profile email",
                },
                timeout=10,
            )
            token_data = token_resp.json()
            access_token = token_data.get("access_token")
            if not access_token:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Signup succeeded but auto-login failed",
                )

        # Step 3: Validate token to extract user info
        auth_result = provider.validate_token(access_token)
        user_info = None
        if auth_result.success and auth_result.user_info:
            u = auth_result.user_info
            user_info = UserInfoResponse(
                id=u.id,
                username=u.username,
                email=u.email,
                display_name=u.display_name,
                avatar_url=u.avatar_url,
                roles=u.roles,
            )

        return LoginResponse(
            access_token=access_token,
            token_type="Bearer",
            user_info=user_info,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Signup failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


class CodeLoginRequest(BaseModel):
    email: str
    code: str


@router.post("/login/code", response_model=LoginResponse)
async def login_code(
    request: CodeLoginRequest, http_request: Request, _: None = Depends(enforce_login_code_rate_limit)
) -> LoginResponse:
    """Login with email verification code via Casdoor.

    On success, exchanges the returned auth code for an access token.
    """
    provider = AuthProvider

    if not isinstance(provider, CasdoorAuthProvider):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Verification code login is only available with Casdoor provider",
        )

    org = getattr(provider.config, "Organization", None)
    app = getattr(provider.config, "Application", None)
    if not org or not app:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: Organization or Application missing",
        )

    try:
        import requests as http_requests

        # Build redirect_uri from request headers (Origin → Referer → X-Forwarded → Host)
        origin = http_request.headers.get("origin", "")
        if not origin:
            referer = http_request.headers.get("referer", "")
            if referer:
                # Extract origin from referer (scheme + host)
                from urllib.parse import urlparse

                parsed = urlparse(referer)
                origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
        if not origin:
            proto = http_request.headers.get("x-forwarded-proto", "https")
            host = http_request.headers.get("x-forwarded-host", "") or http_request.headers.get("host", "")
            if host:
                origin = f"{proto}://{host}"
        redirect_uri = f"{origin}/" if origin else ""
        logger.info(f"Code login redirect_uri={redirect_uri}")

        # Step 1: POST /api/login with type=code
        # Casdoor reads responseType, clientId, redirect_uri from query params
        login_payload = {
            "username": request.email,
            "code": request.code,
            "type": "code",
            "organization": org,
            "application": app,
        }
        login_url = f"{provider.api_base}/api/login"
        login_resp = http_requests.post(
            login_url,
            params={
                "responseType": "code",
                "clientId": provider.audience,
                "redirectUri": redirect_uri,
                "scope": "openid profile email",
            },
            json=login_payload,
            timeout=10,
        )
        logger.info(f"Casdoor login response: status={login_resp.status_code} body={login_resp.text[:500]}")
        login_data = login_resp.json()

        if login_data.get("status") != "ok":
            detail = login_data.get("msg") or login_data.get("message") or "Login failed"
            logger.warning(f"Casdoor code login failed: {detail}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

        auth_code = login_data.get("data")
        if not auth_code:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No auth code returned from Casdoor")

        # Step 2: Exchange auth code for access token
        access_token = provider.exchange_code_for_token(auth_code)

        # Step 3: Validate token to extract user info
        auth_result = provider.validate_token(access_token)
        user_info = None
        if auth_result.success and auth_result.user_info:
            u = auth_result.user_info
            user_info = UserInfoResponse(
                id=u.id,
                username=u.username,
                email=u.email,
                display_name=u.display_name,
                avatar_url=u.avatar_url,
                roles=u.roles,
            )

        return LoginResponse(
            access_token=access_token,
            token_type="Bearer",
            user_info=user_info,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Code login failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


class PasswordLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login/password", response_model=LoginResponse)
async def login_password(
    request: PasswordLoginRequest, _: None = Depends(enforce_password_login_rate_limit)
) -> LoginResponse:
    """Login with email and password via Casdoor resource owner password grant."""
    provider = AuthProvider

    if not isinstance(provider, CasdoorAuthProvider):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Password login is only available with Casdoor provider",
        )

    client_secret = getattr(provider.config, "ClientSecret", None) or ""

    try:
        import requests as http_requests

        # Try email as username first, then normalized email, then prefix variants
        normalized = _normalize_email(request.email)
        candidates = [request.email]
        if normalized != request.email:
            candidates.append(normalized)
        candidates.append(normalized.split("@")[0])
        if request.email.split("@")[0] not in candidates:
            candidates.append(request.email.split("@")[0])
        usernames = candidates
        access_token: str | None = None
        last_error = ""

        for username in usernames:
            token_resp = http_requests.post(
                f"{provider.api_base}/api/login/oauth/access_token",
                data={
                    "grant_type": "password",
                    "client_id": provider.audience,
                    "client_secret": client_secret,
                    "username": username,
                    "password": request.password,
                    "scope": "openid profile email",
                },
                timeout=10,
            )
            token_data = token_resp.json()
            access_token = token_data.get("access_token")
            if access_token:
                break
            last_error = token_data.get("error_description") or token_data.get("error") or "Invalid credentials"

        if not access_token:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=last_error)

        # Validate token to extract user info
        auth_result = provider.validate_token(access_token)
        user_info = None
        if auth_result.success and auth_result.user_info:
            u = auth_result.user_info
            user_info = UserInfoResponse(
                id=u.id,
                username=u.username,
                email=u.email,
                display_name=u.display_name,
                avatar_url=u.avatar_url,
                roles=u.roles,
            )

        return LoginResponse(
            access_token=access_token,
            token_type="Bearer",
            user_info=user_info,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Password login failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


class SendResetCodeRequest(BaseModel):
    email: str


@router.post("/send-reset-code", response_model=SendCodeResponse)
async def send_reset_code(
    request: SendResetCodeRequest, _: None = Depends(enforce_send_code_rate_limit)
) -> SendCodeResponse:
    """Send a password reset verification code to an existing user."""
    _validate_email_format(request.email)

    provider = AuthProvider

    if not isinstance(provider, CasdoorAuthProvider):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Password reset is only available with Casdoor provider",
        )

    org = getattr(provider.config, "Organization", None)
    app = getattr(provider.config, "Application", None)
    if not org or not app:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: Organization or Application missing",
        )

    client_secret = getattr(provider.config, "ClientSecret", None) or ""
    app_id = f"admin/{app}"

    try:
        # Verify user exists and resolve stored email (handles Gmail dot-alias)
        found_email = _find_user_email(provider.api_base, org, request.email, provider.audience, client_secret)
        if not found_email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found")

        # Send verification code to the stored email (for existing user)
        data = _send_casdoor_code(provider.api_base, found_email, app_id, "login", client_secret)

        if data.get("status") == "ok":
            return SendCodeResponse(status="ok", action="login")

        detail = data.get("msg") or data.get("message") or "Failed to send reset code"
        logger.warning(f"Casdoor send-reset-code failed: {detail}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Send reset code failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str


@router.post("/reset-password", response_model=LoginResponse)
async def reset_password(
    request: ResetPasswordRequest, http_request: Request, _: None = Depends(enforce_login_code_rate_limit)
) -> LoginResponse:
    """Reset password using verification code, then auto-login.

    1. Login with code to verify ownership and get access token
    2. Set new password via Casdoor admin API
    3. Return LoginResponse (auto-login)
    """
    provider = AuthProvider

    if not isinstance(provider, CasdoorAuthProvider):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Password reset is only available with Casdoor provider",
        )

    org = getattr(provider.config, "Organization", None)
    app = getattr(provider.config, "Application", None)
    if not org or not app:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: Organization or Application missing",
        )

    client_secret = getattr(provider.config, "ClientSecret", None) or ""

    try:
        import requests as http_requests

        # Resolve the stored email (handles Gmail dot-alias)
        resolved_email = _find_user_email(provider.api_base, org, request.email, provider.audience, client_secret)
        if not resolved_email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User not found")

        # Step 1: Login with code to verify ownership
        origin = http_request.headers.get("origin", "")
        if not origin:
            referer = http_request.headers.get("referer", "")
            if referer:
                from urllib.parse import urlparse

                parsed = urlparse(referer)
                origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
        if not origin:
            proto = http_request.headers.get("x-forwarded-proto", "https")
            host = http_request.headers.get("x-forwarded-host", "") or http_request.headers.get("host", "")
            if host:
                origin = f"{proto}://{host}"
        redirect_uri = f"{origin}/" if origin else ""

        login_payload = {
            "username": resolved_email,
            "code": request.code,
            "type": "code",
            "organization": org,
            "application": app,
        }
        login_resp = http_requests.post(
            f"{provider.api_base}/api/login",
            params={
                "responseType": "code",
                "clientId": provider.audience,
                "redirectUri": redirect_uri,
                "scope": "openid profile email",
            },
            json=login_payload,
            timeout=10,
        )
        login_data = login_resp.json()

        if login_data.get("status") != "ok":
            detail = login_data.get("msg") or login_data.get("message") or "Invalid verification code"
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

        auth_code = login_data.get("data")
        if not auth_code:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No auth code returned")

        # Exchange for access token
        access_token = provider.exchange_code_for_token(auth_code)

        # Step 2: Get user info to find the username for set-password
        auth_result = provider.validate_token(access_token)
        if not auth_result.success or not auth_result.user_info:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to verify user identity")

        u = auth_result.user_info
        logger.debug(f"Reset password: resolved user org={org} username={u.username} email={u.email}")

        # Step 3: Set new password via Casdoor admin API
        # Casdoor set-password expects form data, not JSON
        set_pw_resp = http_requests.post(
            f"{provider.api_base}/api/set-password",
            data={
                "userOwner": org,
                "userName": u.username,
                "newPassword": request.new_password,
            },
            params={
                "clientId": provider.audience,
                "clientSecret": client_secret,
            },
            timeout=10,
        )
        set_pw_data = set_pw_resp.json()
        if set_pw_data.get("status") != "ok":
            detail = set_pw_data.get("msg") or set_pw_data.get("message") or "Failed to set new password"
            logger.warning(f"Casdoor set-password failed: {detail}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

        user_info = UserInfoResponse(
            id=u.id,
            username=u.username,
            email=u.email,
            display_name=u.display_name,
            avatar_url=u.avatar_url,
            roles=u.roles,
        )

        return LoginResponse(
            access_token=access_token,
            token_type="Bearer",
            user_info=user_info,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reset password failed: {e}")
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
