import logging
from typing import Optional

import requests as http_requests
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

logger = logging.getLogger(__name__)

router = APIRouter(tags=["auth"])


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    code: str
    state: Optional[str] = None


class LoginResponse(BaseModel):
    access_token: str
    token_type: str
    user_info: Optional["UserInfoResponse"] = None


class AuthStatusResponse(BaseModel):
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
    id: str
    username: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    roles: Optional[list] = None


class AuthValidationResponse(BaseModel):
    success: bool
    user_info: Optional[UserInfoResponse] = None
    error_message: Optional[str] = None
    error_code: Optional[str] = None


class LinkedAccountResponse(BaseModel):
    provider_name: str
    provider_display_name: str
    provider_icon_url: Optional[str] = None
    user_id: str
    username: Optional[str] = None
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    is_valid: Optional[bool] = None


class LinkedAccountsResponse(BaseModel):
    accounts: list[LinkedAccountResponse]


class LinkUrlResponse(BaseModel):
    url: str
    provider_type: str


class SendCodeRequest(BaseModel):
    email: str
    captcha_token: str | None = None


class SendCodeResponse(BaseModel):
    status: str
    action: str  # "login" or "signup"


class SignupRequest(BaseModel):
    email: str
    password: str
    code: str


class CodeLoginRequest(BaseModel):
    email: str
    code: str


class PasswordLoginRequest(BaseModel):
    email: str
    password: str


class SendResetCodeRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    email: str
    code: str
    new_password: str


class AvatarUpdateResponse(BaseModel):
    success: bool
    avatar_url: Optional[str] = None
    message: Optional[str] = None


class DisplayNameUpdateRequest(BaseModel):
    display_name: str


class DisplayNameUpdateResponse(BaseModel):
    success: bool
    display_name: Optional[str] = None
    message: Optional[str] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_GMAIL_DOMAINS = {"gmail.com", "googlemail.com"}


def _normalize_email(email: str) -> str:
    """Lowercase domain; strip dots from Gmail local part."""
    local, _, domain = email.partition("@")
    if not domain:
        return email
    domain = domain.lower()
    if domain in _GMAIL_DOMAINS:
        local = local.replace(".", "")
    return f"{local}@{domain}"


def _validate_email_format(email: str) -> None:
    """Reject + sub-addressing (bulk registration vector)."""
    local_part = email.split("@")[0] if "@" in email else ""
    if "+" in local_part:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email addresses with + are not allowed",
        )


def _require_casdoor() -> tuple[CasdoorAuthProvider, str, str, str, str]:
    """Return ``(provider, org, app, client_secret, app_id)`` or raise."""
    provider = AuthProvider
    if not isinstance(provider, CasdoorAuthProvider):
        raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Only available with Casdoor provider")
    org = getattr(provider.config, "Organization", None)
    app = getattr(provider.config, "Application", None)
    if not org or not app:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Organization or Application missing"
        )
    client_secret = getattr(provider.config, "ClientSecret", None) or ""
    app_owner = getattr(provider.config, "ApplicationOwner", "admin")
    app_id = f"{app_owner}/{app}"
    return provider, org, app, client_secret, app_id


def _resolve_origin(request: Request) -> str:
    """Extract origin from request headers (Origin → Referer → X-Forwarded → Host)."""
    origin = request.headers.get("origin", "")
    if not origin:
        referer = request.headers.get("referer", "")
        if referer:
            from urllib.parse import urlparse

            parsed = urlparse(referer)
            origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else ""
    if not origin:
        proto = request.headers.get("x-forwarded-proto", "https")
        host = request.headers.get("x-forwarded-host", "") or request.headers.get("host", "")
        if host:
            origin = f"{proto}://{host}"
    return origin


def _to_user_info(u) -> UserInfoResponse:
    """Convert an auth-provider user_info object to UserInfoResponse."""
    return UserInfoResponse(
        id=u.id,
        username=u.username,
        email=u.email,
        display_name=u.display_name,
        avatar_url=u.avatar_url,
        roles=u.roles,
    )


def _validate_and_login(provider: CasdoorAuthProvider, access_token: str) -> LoginResponse:
    """Validate token → extract user info → return LoginResponse."""
    auth_result = provider.validate_token(access_token)
    user_info = _to_user_info(auth_result.user_info) if auth_result.success and auth_result.user_info else None
    return LoginResponse(access_token=access_token, token_type="Bearer", user_info=user_info)


def _verify_turnstile(token: str, secret: str) -> bool:
    """Verify Cloudflare Turnstile token."""
    try:
        resp = http_requests.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": secret, "response": token},
            timeout=5,
        )
        return bool(resp.json().get("success"))
    except Exception:
        logger.warning("Turnstile verification request failed")
        return False


def _send_casdoor_code(api_base: str, email: str, app_id: str, method: str, client_secret: str) -> dict:
    """POST Casdoor send-verification-code; return parsed JSON."""
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


def _check_user_exists(provider: CasdoorAuthProvider, org: str, email: str, client_secret: str) -> bool:
    """Check if a user with the given email exists in Casdoor.

    Uses ``GET /api/get-user?owner=org&email=email`` which returns the user
    object when found or ``null`` when not.
    """
    resp = http_requests.get(
        f"{provider.api_base}/api/get-user",
        params={"owner": org, "email": email, "clientId": provider.audience, "clientSecret": client_secret},
        timeout=10,
    )
    return resp.json().get("data") is not None


def _casdoor_code_login(
    provider: CasdoorAuthProvider, org: str, app: str, email: str, code: str, request: Request
) -> LoginResponse:
    """Login via Casdoor verification code → exchange → validate → LoginResponse.

    Shared by ``login/code`` and ``reset-password`` endpoints.
    """
    origin = _resolve_origin(request)
    redirect_uri = f"{origin}/" if origin else ""

    login_resp = http_requests.post(
        f"{provider.api_base}/api/login",
        params={
            "responseType": "code",
            "clientId": provider.audience,
            "redirectUri": redirect_uri,
            "scope": "openid profile email",
        },
        json={
            "username": email,
            "code": code,
            "type": "code",
            "organization": org,
            "application": app,
        },
        timeout=10,
    )
    login_data = login_resp.json()

    if login_data.get("status") != "ok":
        detail = login_data.get("msg") or login_data.get("message") or "Login failed"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    auth_code = login_data.get("data")
    if not auth_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No auth code returned")

    access_token = provider.exchange_code_for_token(auth_code)
    return _validate_and_login(provider, access_token)


# ---------------------------------------------------------------------------
# Endpoints — Auth status & config
# ---------------------------------------------------------------------------


@router.get("/status", response_model=AuthStatusResponse)
async def get_auth_status() -> AuthStatusResponse:
    provider = AuthProvider
    logger.info(f"认证服务已配置，使用提供商: {provider.get_provider_name()}")
    return AuthStatusResponse(
        is_configured=True,
        provider=provider.get_provider_name(),
        message=f"认证服务已配置 ({provider.get_provider_name()})",
    )


@router.get("/config", response_model=AuthProviderConfigResponse)
async def get_auth_config() -> AuthProviderConfigResponse:
    from app.configs import configs

    provider = AuthProvider
    return AuthProviderConfigResponse(
        provider=provider.get_provider_name(),
        issuer=getattr(provider, "issuer", None),
        audience=getattr(provider, "audience", None),
        jwks_uri=getattr(provider, "jwks_uri", None),
        algorithm=getattr(provider, "algorithm", None),
        organization=getattr(provider.config, "Organization", None),
        application=getattr(provider.config, "Application", None),
        turnstile_site_key=configs.Auth.TurnstileSiteKey or None,
    )


# ---------------------------------------------------------------------------
# Endpoints — Token validation & user info
# ---------------------------------------------------------------------------


@router.post("/validate", response_model=AuthValidationResponse)
async def validate_token(
    authorization: Optional[str] = Header(None, description="Bearer token"),
) -> AuthValidationResponse:
    """验证 access_token 并返回用户信息"""
    logger.info("开始验证 access_token")

    if not authorization:
        logger.warning("缺少 Authorization header")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")

    logger.info(f"收到 Authorization header: {authorization[:20]}..." if len(authorization) > 20 else authorization)

    if not authorization.startswith("Bearer "):
        logger.warning("Authorization header 格式无效，不是 Bearer 格式")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header format")

    access_token = authorization[7:]
    logger.info(f"解析得到 access_token (前20字符): {access_token[:20]}...")

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

    user_info = None
    if auth_result.user_info:
        logger.info(
            f"验证成功，用户信息: id={auth_result.user_info.id}, "
            f"username={auth_result.user_info.username}, "
            f"display_name={auth_result.user_info.display_name}, "
            f"avatar_url={auth_result.user_info.avatar_url}"
        )
        user_info = _to_user_info(auth_result.user_info)
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
    validation_result = await validate_token(authorization)

    if not validation_result.success or not validation_result.user_info:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=validation_result.error_message or "Token validation failed",
        )

    return validation_result.user_info


# ---------------------------------------------------------------------------
# Endpoints — Login (OAuth code, verification code, password)
# ---------------------------------------------------------------------------


@router.post("/login/casdoor", response_model=LoginResponse)
async def login_casdoor(request: LoginRequest) -> LoginResponse:
    """Casdoor 授权码登录接口"""
    try:
        logger.info("收到 Casdoor 登录请求")
        result = authentication_service.login_with_code(request.code, request.state)
        user_info = _to_user_info(result["user_info"]) if result.get("user_info") else None
        return LoginResponse(access_token=result["access_token"], token_type=result["token_type"], user_info=user_info)
    except Exception as e:
        logger.error(f"Login failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/login/code", response_model=LoginResponse)
async def login_code(
    request: CodeLoginRequest, http_request: Request, _: None = Depends(enforce_login_code_rate_limit)
) -> LoginResponse:
    """Login with email verification code via Casdoor."""
    provider, org, app, _secret, _app_id = _require_casdoor()
    try:
        return _casdoor_code_login(provider, org, app, request.email, request.code, http_request)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Code login failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/login/password", response_model=LoginResponse)
async def login_password(
    request: PasswordLoginRequest, _: None = Depends(enforce_password_login_rate_limit)
) -> LoginResponse:
    """Login with email + password via Casdoor resource owner password grant."""
    provider, _org, _app, client_secret, _app_id = _require_casdoor()

    try:
        # Casdoor accepts email as username; fall back to email prefix
        candidates = [request.email, request.email.split("@")[0]]
        access_token: str | None = None
        last_error = ""

        for username in candidates:
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

        return _validate_and_login(provider, access_token)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Password login failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ---------------------------------------------------------------------------
# Endpoints — Send code, signup, forgot password
# ---------------------------------------------------------------------------


@router.post("/send-code", response_model=SendCodeResponse)
async def send_verification_code(
    request: SendCodeRequest, _: None = Depends(enforce_send_code_rate_limit)
) -> SendCodeResponse:
    """Detect whether the email is an existing user or a new signup.

    - Existing user → return ``action="login"`` (no email sent; frontend shows password form).
    - New user → send signup verification code, return ``action="signup"``.

    Detection: probe Casdoor password grant with a dummy password. Casdoor
    returns distinct errors for "wrong password" vs "user does not exist",
    so no email is sent and no side effects occur.
    """
    _validate_email_format(request.email)

    if request.captcha_token:
        from app.configs import configs

        turnstile_secret = configs.Auth.TurnstileSecret
        if turnstile_secret and not _verify_turnstile(request.captcha_token, turnstile_secret):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CAPTCHA verification failed")

    provider, _org, _app, client_secret, app_id = _require_casdoor()

    try:
        if _check_user_exists(provider, _org, request.email, client_secret):
            return SendCodeResponse(status="ok", action="login")

        # New user — send signup verification code
        normalized = _normalize_email(request.email)
        data = _send_casdoor_code(provider.api_base, normalized, app_id, "signup", client_secret)

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


@router.post("/signup", response_model=LoginResponse)
async def signup(request: SignupRequest, _: None = Depends(enforce_signup_rate_limit)) -> LoginResponse:
    """Register a new user via Casdoor and return an access token."""
    _validate_email_format(request.email)

    provider, org, app, client_secret, _app_id = _require_casdoor()
    normalized = _normalize_email(request.email)
    username = normalized.split("@")[0]

    try:
        # Step 1: Register
        signup_resp = http_requests.post(
            f"{provider.api_base}/api/signup",
            json={
                "organization": org,
                "application": app,
                "username": username,
                "name": username,
                "email": normalized,
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

        # Step 2: Get access token (code exchange → fallback to password grant)
        access_token: str | None = None
        auth_code = signup_data.get("data")
        if auth_code:
            try:
                access_token = provider.exchange_code_for_token(auth_code)
            except Exception as exc:
                logger.warning(f"Code exchange after signup failed, trying password grant: {exc}")

        if not access_token:
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
            access_token = token_resp.json().get("access_token")
            if not access_token:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="Signup succeeded but auto-login failed"
                )

        return _validate_and_login(provider, access_token)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Signup failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/send-reset-code", response_model=SendCodeResponse)
async def send_reset_code(
    request: SendResetCodeRequest, _: None = Depends(enforce_send_code_rate_limit)
) -> SendCodeResponse:
    """Send a password-reset verification code.

    Uses Casdoor's native ``method=forget`` which handles user lookup internally.
    """
    _validate_email_format(request.email)

    provider, _org, _app, client_secret, app_id = _require_casdoor()

    try:
        data = _send_casdoor_code(provider.api_base, request.email, app_id, "forget", client_secret)

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


@router.post("/reset-password", response_model=LoginResponse)
async def reset_password(
    request: ResetPasswordRequest, http_request: Request, _: None = Depends(enforce_login_code_rate_limit)
) -> LoginResponse:
    """Reset password: verify code → set new password → auto-login."""
    provider, org, app, client_secret, _app_id = _require_casdoor()

    try:
        # Step 1: Login with verification code to prove ownership
        login_response = _casdoor_code_login(provider, org, app, request.email, request.code, http_request)

        # Step 2: Extract username from the validated token
        if not login_response.user_info:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to verify user identity")

        # Step 3: Set new password via Casdoor admin API (form data, not JSON)
        set_pw_resp = http_requests.post(
            f"{provider.api_base}/api/set-password",
            data={
                "userOwner": org,
                "userName": login_response.user_info.username,
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

        return login_response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reset password failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# ---------------------------------------------------------------------------
# Endpoints — Account management
# ---------------------------------------------------------------------------


@router.get("/linked-accounts", response_model=LinkedAccountsResponse)
async def get_linked_accounts(
    authorization: Optional[str] = Header(None, description="Bearer token"),
    validate: bool = Query(False, description="是否验证第三方 token 有效性"),
) -> LinkedAccountsResponse:
    """获取用户已绑定的第三方账户列表"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid authorization header")

    access_token = authorization[7:]
    provider = AuthProvider

    if not isinstance(provider, CasdoorAuthProvider):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Linked accounts feature is only available with Casdoor provider",
        )

    linked_accounts = provider.get_linked_accounts(access_token)

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
    """获取第三方账户绑定 URL"""
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


@router.post("/avatar", response_model=AvatarUpdateResponse)
async def update_avatar(
    file: UploadFile = File(..., description="头像图片文件"),
    authorization: Optional[str] = Header(None, description="Bearer token"),
) -> AvatarUpdateResponse:
    """上传并更新用户头像 (PNG/JPG/GIF/WebP, ≤5 MB)"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid authorization header")

    access_token = authorization[7:]
    provider = AuthProvider

    if not isinstance(provider, CasdoorAuthProvider):
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Avatar update is only available with Casdoor provider",
        )

    allowed_types = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}",
        )

    file_data = await file.read()
    if len(file_data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File size exceeds 5MB limit")

    avatar_url = provider.upload_avatar(
        access_token=access_token,
        file_data=file_data,
        filename=file.filename or "avatar.png",
        content_type=file.content_type or "image/png",
    )

    if not avatar_url:
        return AvatarUpdateResponse(success=False, message="Failed to upload avatar")

    if not provider.update_user_avatar(access_token, avatar_url):
        return AvatarUpdateResponse(
            success=False, avatar_url=avatar_url, message="Avatar uploaded but failed to update user profile"
        )

    return AvatarUpdateResponse(success=True, avatar_url=avatar_url, message="Avatar updated successfully")


@router.post("/display-name", response_model=DisplayNameUpdateResponse)
async def update_display_name(
    request: DisplayNameUpdateRequest,
    authorization: Optional[str] = Header(None, description="Bearer token"),
) -> DisplayNameUpdateResponse:
    """更新用户显示名称 (1-50 字符)"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing or invalid authorization header")

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

    if not provider.update_user_display_name(access_token, display_name):
        return DisplayNameUpdateResponse(success=False, message="Failed to update display name")

    return DisplayNameUpdateResponse(
        success=True, display_name=display_name, message="Display name updated successfully"
    )
