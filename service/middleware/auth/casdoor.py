import logging
from typing import Any

import requests

from . import AuthResult, BaseAuthProvider, UserInfo

# 设置日志记录器
logger = logging.getLogger(__name__)


class CasdoorAuthProvider(BaseAuthProvider):
    """Casdoor 认证提供商"""

    def get_provider_name(self) -> str:
        return "casdoor"

    def is_configured(self) -> bool:
        """检查提供商是否已正确配置 - Casdoor 只需要 issuer"""
        is_valid = bool(self.issuer)
        logger.debug(f"Casdoor 配置检查: issuer={self.issuer}, valid={is_valid}")
        return is_valid

    def validate_token(self, access_token: str) -> AuthResult:
        """验证 access_token 并获取用户信息"""
        logger.debug(f"Casdoor: 开始验证 token (前20字符): {access_token[:20]}...")

        if not self.is_configured():
            logger.error("Casdoor: 认证服务未配置")
            return AuthResult(
                success=False,
                error_code="AUTH_NOT_CONFIGURED",
                error_message="Casdoor authentication is not configured",
            )

        logger.debug("Casdoor: 认证服务已配置，开始通过 API 验证token...")
        try:
            # 使用 Casdoor 的 userinfo 接口获取用户信息
            userinfo_url = f"{self.issuer}/api/user"
            logger.debug(f"Casdoor: 调用用户信息接口: {userinfo_url}")

            headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}

            response = requests.get(userinfo_url, headers=headers, timeout=10)
            logger.debug(f"Casdoor: userinfo API 响应状态: {response.status_code}")

            if response.status_code == 401:
                logger.warning("Casdoor: Token 无效或已过期")
                return AuthResult(success=False, error_code="INVALID_TOKEN", error_message="Invalid or expired token")

            if not response.ok:
                logger.error(f"Casdoor: userinfo API 请求失败: {response.status_code} - {response.text}")
                return AuthResult(
                    success=False, error_code="API_ERROR", error_message=f"Casdoor API error: {response.status_code}"
                )

            userinfo_data = response.json()
            logger.debug(f"Casdoor: 获取用户信息响应: {userinfo_data}")

            # 检查 Casdoor API 响应状态
            if userinfo_data.get("status") == "error":
                error_msg = userinfo_data.get("msg", "Unknown error")
                logger.error(f"Casdoor: API 返回错误: {error_msg}")
                return AuthResult(success=False, error_code="CASDOOR_API_ERROR", error_message=error_msg)

            # 解析用户信息
            user_info = self.parse_userinfo_response(userinfo_data)
            logger.debug(f"Casdoor: 用户信息解析完成，用户ID: {user_info.id}, 用户名: {user_info.username}")
            return AuthResult(success=True, user_info=user_info)

        except requests.RequestException as e:
            logger.error(f"Casdoor: API 请求异常: {str(e)}")
            return AuthResult(success=False, error_code="NETWORK_ERROR", error_message=f"Network error: {str(e)}")
        except Exception as e:
            logger.error(f"Casdoor: Token验证异常: {str(e)}")
            return AuthResult(
                success=False, error_code="TOKEN_VALIDATION_ERROR", error_message=f"Token validation failed: {str(e)}"
            )

    def parse_userinfo_response(self, userinfo_data: dict[str, Any]) -> UserInfo:
        """从 Casdoor userinfo API 响应解析用户信息"""
        logger.debug("Casdoor: 解析 userinfo API 响应中的用户信息")
        logger.debug(f"Casdoor: userinfo 数据: {userinfo_data}")

        # Extract user ID - try multiple fields
        user_id = userinfo_data.get("sub") or userinfo_data.get("id") or userinfo_data.get("name") or ""
        if not user_id:
            logger.error(f"Casdoor: 无法从 userinfo 中提取用户ID！数据: {userinfo_data}")
        else:
            logger.debug(f"Casdoor: 成功提取用户ID: {user_id}")

        # Casdoor 返回标准的 JWT userinfo 格式
        user_info = UserInfo(
            id=user_id,
            username=userinfo_data.get("preferred_username", ""),
            email=userinfo_data.get("email"),
            display_name=userinfo_data.get("name", userinfo_data.get("preferred_username", "")),
            avatar_url=userinfo_data.get("picture"),
            roles=userinfo_data.get("roles", []),
            extra={
                "iss": userinfo_data.get("iss"),
                "aud": userinfo_data.get("aud"),
                "exp": userinfo_data.get("exp"),
                "iat": userinfo_data.get("iat"),
                "groups": userinfo_data.get("groups", []),
                "permissions": userinfo_data.get("permissions", []),
            },
        )

        logger.debug(f"Casdoor: 解析结果 - ID: {user_info.id}, 用户名: {user_info.username}, 邮箱: {user_info.email}")
        return user_info

    def exchange_code_for_token(self, code: str) -> str:
        """Exchange authorization code for access token"""
        # Ensure Client Secret is configured
        client_secret = getattr(self.config, "ClientSecret", None)
        if not client_secret:
            logger.error("Casdoor Client Secret not configured")
            raise Exception("Server configuration error: Client Secret missing")

        url = f"{self.issuer.rstrip('/')}/api/login/oauth/access_token"

        payload = {
            "grant_type": "authorization_code",
            "client_id": self.audience,
            "client_secret": client_secret,
            "code": code,
        }

        try:
            logger.debug(f"Exchanging code for token with URL: {url}")
            response = requests.post(url, data=payload, timeout=10)
            response.raise_for_status()
            data = response.json()

            if "access_token" in data:
                return data["access_token"]
            elif "error" in data:
                logger.error(f"Casdoor returned error: {data.get('error_description', data.get('error'))}")
                raise Exception(f"Casdoor error: {data.get('error_description', data.get('error'))}")
            else:
                logger.error(f"Failed to get access token from Casdoor response: {data}")
                raise Exception("Failed to retrieve access token from response")

        except Exception as e:
            logger.error(f"Error exchanging code for token: {e}")
            raise e

    def parse_user_info(self, token_payload: dict[str, Any]) -> UserInfo:
        """从 token payload 解析用户信息"""
        logger.debug("Casdoor: 解析token payload中的用户信息")
        logger.debug(f"Casdoor: payload内容: {token_payload}")

        # Casdoor token 结构解析
        user_info = UserInfo(
            id=token_payload.get("sub", ""),
            username=token_payload.get("preferred_username", ""),
            email=token_payload.get("email"),
            display_name=token_payload.get("name", token_payload.get("preferred_username", "")),
            avatar_url=token_payload.get("picture"),
            roles=token_payload.get("roles", []),
            extra={
                "iss": token_payload.get("iss"),
                "aud": token_payload.get("aud"),
                "exp": token_payload.get("exp"),
                "iat": token_payload.get("iat"),
                "groups": token_payload.get("groups", []),
                "permissions": token_payload.get("permissions", []),
            },
        )

        logger.debug(f"Casdoor: 解析结果 - ID: {user_info.id}, 用户名: {user_info.username}, 邮箱: {user_info.email}")
        return user_info
