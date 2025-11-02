import logging
import time

import httpx
from fastmcp.server.auth import AccessToken, TokenVerifier
from typing_extensions import TypedDict

logger = logging.getLogger(__name__)


class CachedTokenData(TypedDict):
    """缓存的 Token 数据结构"""

    access_token: AccessToken
    expires_at: float


class BohrAppUserData(TypedDict, total=False):
    """BohrApp API 返回的用户数据结构"""

    bohr_user_id: int
    user_id: str
    name: str
    org_id: int


class BohrAppAPIResponse(TypedDict):
    """BohrApp API 响应结构"""

    code: int
    data: BohrAppUserData


class BohrAppTokenVerifier(TokenVerifier):
    """BohrApp API 认证验证器"""

    def __init__(
        self,
        api_url: str,
        x_app_key: str,
        base_url: str | None = None,
        required_scopes: list[str] | None = None,
    ):
        super().__init__(base_url=base_url, required_scopes=required_scopes)
        self.api_url = api_url
        self.x_app_key = x_app_key
        # 使用 dict 而不是 TypedDict，因为 key 是动态的 token 字符串
        self._cache: dict[str, CachedTokenData] = {}  # 简单缓存

    async def verify_token(self, token: str) -> AccessToken | None:
        """
        验证 accessKey 并返回 AccessToken

        Args:
            token: 实际上是 accessKey (如 sk-xxx)

        Returns:
            AccessToken 或 None
        """
        # 1. 检查缓存
        if token in self._cache:
            cached = self._cache[token]
            if cached["expires_at"] > time.time():
                return cached["access_token"]

        # 2. 调用 BohrApp API
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    self.api_url,
                    headers={
                        "x-app-key": self.x_app_key,
                        "accessKey": token,  # 关键：token 作为 accessKey
                    },
                    timeout=10,
                )

                if response.status_code != 200:
                    return None

                data: BohrAppAPIResponse = response.json()

                if data.get("code") != 0:
                    return None

                # 3. 提取用户信息
                user_data: BohrAppUserData = data.get("data", {})
                bohr_user_id = user_data.get("bohr_user_id")

                if not bohr_user_id:
                    return None

                # 4. 构建 AccessToken
                claims_data = {  # 额外信息放这里
                    "bohr_user_id": bohr_user_id,
                    "name": user_data.get("name"),
                    "user_id": user_data.get("user_id"),
                    "org_id": user_data.get("org_id"),
                }

                access_token = AccessToken(
                    token=token,
                    client_id=str(bohr_user_id),  # 必需：用户标识
                    scopes=[],  # BohrApp 没有 scopes 概念，可以为空或自定义
                    expires_at=None,  # BohrApp API 没返回过期时间
                    claims=claims_data,
                )

                # 5. 缓存结果
                cached_data: CachedTokenData = {
                    "access_token": access_token,
                    "expires_at": time.time() + 3600,  # 缓存1小时
                }
                self._cache[token] = cached_data

                return access_token

        except Exception as e:
            logger.error(f"BohrApp API 验证失败: {e}")
            return None
