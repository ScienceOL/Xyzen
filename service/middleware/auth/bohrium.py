import logging
from typing import Any

import requests

from . import AuthResult, BaseAuthProvider, UserInfo
from .simple_cache import cached_token_validation

# 设置日志记录器
logger = logging.getLogger(__name__)


class BohriumAuthProvider(BaseAuthProvider):
    """Bohrium 认证提供商"""

    def get_provider_name(self) -> str:
        return "bohrium"

    def is_configured(self) -> bool:
        """检查提供商是否已正确配置 - Bohrium 只需要 issuer"""
        is_valid = bool(self.issuer)
        logger.info(f"Bohrium 配置检查: issuer={self.issuer}, valid={is_valid}")
        return is_valid

    @cached_token_validation
    def validate_token(self, access_token: str) -> AuthResult:
        """验证 access_token 并获取用户信息"""
        logger.info(f"Bohrium: 开始验证 token (前20字符): {access_token[:20]}...")

        if not self.is_configured():
            logger.error("Bohrium: 认证服务未配置")
            return AuthResult(
                success=False,
                error_code="AUTH_NOT_CONFIGURED",
                error_message="Bohrium authentication is not configured",
            )

        if not self.issuer:
            logger.error("Bohrium: Issuer 未配置")
            return AuthResult(
                success=False,
                error_code="AUTH_NOT_CONFIGURED",
                error_message="Bohrium issuer is not configured",
            )

        logger.info("Bohrium: 认证服务已配置，开始通过 API 验证token...")
        try:
            # 直接使用 issuer 作为用户信息接口地址
            userinfo_url = self.issuer
            logger.info(f"Bohrium: 调用用户信息接口: {userinfo_url}")

            headers = {
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Content-Language": "zh-cn",
                "Pragma": "no-cache",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36"
                ),
            }

            response = requests.get(userinfo_url, headers=headers, timeout=10)
            logger.info(f"Bohrium: userinfo API 响应状态: {response.status_code}")

            if response.status_code == 401:
                logger.warning("Bohrium: Token 无效或已过期")
                return AuthResult(success=False, error_code="INVALID_TOKEN", error_message="Invalid or expired token")

            if not response.ok:
                logger.error(f"Bohrium: userinfo API 请求失败: {response.status_code} - {response.text}")
                return AuthResult(
                    success=False, error_code="API_ERROR", error_message=f"Bohrium API error: {response.status_code}"
                )

            userinfo_data = response.json()
            logger.info(f"Bohrium: 获取用户信息响应: {userinfo_data}")

            # 检查 Bohrium API 响应状态
            if userinfo_data.get("code") != 0:
                error_msg = userinfo_data.get("msg", "Unknown error")
                logger.error(f"Bohrium: API 返回错误: {error_msg}")
                return AuthResult(success=False, error_code="BOHRIUM_API_ERROR", error_message=error_msg)

            # 解析用户信息
            user_info = self.parse_userinfo_response(userinfo_data)
            logger.info(f"Bohrium: 用户信息解析完成，用户ID: {user_info.id}, 用户名: {user_info.username}")
            return AuthResult(success=True, user_info=user_info)

        except requests.RequestException as e:
            logger.error(f"Bohrium: API 请求异常: {str(e)}")
            return AuthResult(success=False, error_code="NETWORK_ERROR", error_message=f"Network error: {str(e)}")
        except Exception as e:
            logger.error(f"Bohrium: Token验证异常: {str(e)}")
            return AuthResult(
                success=False, error_code="TOKEN_VALIDATION_ERROR", error_message=f"Token validation failed: {str(e)}"
            )

    def parse_userinfo_response(self, userinfo_data: dict[str, Any]) -> UserInfo:
        """从 Bohrium userinfo API 响应解析用户信息"""
        logger.info("Bohrium: 解析 userinfo API 响应中的用户信息")
        logger.info(f"Bohrium: userinfo 数据: {userinfo_data}")

        # 获取 data 字段中的用户信息
        data = userinfo_data.get("data", {})

        # Bohrium API 返回的用户信息结构
        user_info = UserInfo(
            id=str(data.get("userId", "")),  # 确保 user_id 是字符串类型
            username=data.get("userName", data.get("userNameEn", "")),
            email=data.get("email"),
            display_name=data.get("userName", data.get("userNameEn", "")),
            avatar_url=data.get("avatarUrl"),
            roles=[],  # Bohrium 响应中没有角色信息
            extra={
                "orgId": data.get("orgId"),
                "orgName": data.get("orgName", ""),
                "userNameEn": data.get("userNameEn", ""),
                "phone": data.get("phone", ""),
                "projectCount": data.get("projectCount", 0),
                "oversea": data.get("oversea", 0),
                "level": data.get("level", 1),
                "userType": data.get("userType", "user"),
                "orgType": data.get("orgType", 1),
                "userNo": data.get("userNo", ""),
                "orgNo": data.get("orgNo", ""),
                "loginSource": data.get("loginSource", ""),
                "extend": data.get("extend", {}),
            },
        )

        logger.info(f"Bohrium: 解析结果 - ID: {user_info.id}, 用户名: {user_info.username}, 邮箱: {user_info.email}")
        return user_info

    def parse_user_info(self, token_payload: dict[str, Any]) -> UserInfo:
        """
        从 token payload 解析用户信息 - Bohrium 主要通过 API 获取用户信息
        """

        logger.info("Bohrium: 解析token payload中的用户信息")
        logger.info(f"Bohrium: payload内容: {token_payload}")

        identity = token_payload.get("identity", {})
        user_id = str(identity.get("userId") or token_payload.get("userId") or token_payload.get("sub", ""))

        user_info = UserInfo(
            id=user_id,
            username=token_payload.get("username", token_payload.get("preferred_username", "")),
            email=token_payload.get("email"),
            display_name=token_payload.get("name", token_payload.get("username", "")),
            avatar_url=token_payload.get("avatar"),
            roles=token_payload.get("roles", []),
            extra={
                "iss": token_payload.get("iss"),
                "aud": token_payload.get("aud"),
                "exp": token_payload.get("exp"),
                "iat": token_payload.get("iat"),
                "orig_iat": token_payload.get("orig_iat"),
                "identity": identity,
                "orgId": identity.get("orgId"),
                "env": identity.get("env"),
            },
        )

        logger.info(f"Bohrium: 解析结果 - ID: {user_info.id}, 用户名: {user_info.username}, 邮箱: {user_info.email}")
        return user_info
