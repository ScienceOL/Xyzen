import logging
from typing import Any, Dict

import requests

from . import AuthResult, BaseAuthProvider, UserInfo
from .simple_cache import cached_token_validation

# 设置日志记录器
logger = logging.getLogger(__name__)

# BohrApp 的固定 x-app-key
BOHRAPP_X_APP_KEY = "xyzen-uuid1760783737"


class BohrAppAuthProvider(BaseAuthProvider):
    """BohrApp 认证提供商 - 使用 x-app-key 和 accessKey 进行鉴权"""

    def get_provider_name(self) -> str:
        return "bohr_app"

    def is_configured(self) -> bool:
        """检查提供商是否已正确配置 - BohrApp 只需要 issuer"""
        is_valid = bool(self.issuer)
        logger.info(f"BohrApp 配置检查: issuer={self.issuer}, valid={is_valid}")
        return is_valid

    @cached_token_validation
    def validate_token(self, access_token: str) -> AuthResult:
        """
        验证 accessKey 并获取用户信息

        注意: BohrApp 使用 accessKey 而不是传统的 Bearer token
        accessKey 通过请求头 'accessKey' 传递，同时需要 'x-app-key' 头部
        """
        logger.info(f"BohrApp: 开始验证 accessKey (前20字符): {access_token[:20]}...")

        if not self.is_configured():
            logger.error("BohrApp: 认证服务未配置")
            return AuthResult(
                success=False,
                error_code="AUTH_NOT_CONFIGURED",
                error_message="BohrApp authentication is not configured",
            )

        if not self.issuer:
            logger.error("BohrApp: Issuer 未配置")
            return AuthResult(
                success=False,
                error_code="AUTH_NOT_CONFIGURED",
                error_message="BohrApp issuer is not configured",
            )

        logger.info("BohrApp: 认证服务已配置，开始通过 API 验证 accessKey...")
        try:
            # 使用 issuer 作为用户信息接口地址
            userinfo_url = self.issuer
            logger.info(f"BohrApp: 调用用户信息接口: {userinfo_url}")

            # BohrApp 使用 x-app-key 和 accessKey 头部进行鉴权
            headers = {
                "x-app-key": BOHRAPP_X_APP_KEY,
                "accessKey": access_token,
                "Accept": "application/json",
                "User-Agent": "Xyzen/1.0",
            }

            response = requests.get(userinfo_url, headers=headers, timeout=10)
            logger.info(f"BohrApp: userinfo API 响应状态: {response.status_code}")

            if response.status_code == 401:
                logger.warning("BohrApp: accessKey 无效或已过期")
                return AuthResult(
                    success=False, error_code="INVALID_TOKEN", error_message="Invalid or expired accessKey"
                )

            if not response.ok:
                logger.error(f"BohrApp: userinfo API 请求失败: {response.status_code} - {response.text}")
                return AuthResult(
                    success=False, error_code="API_ERROR", error_message=f"BohrApp API error: {response.status_code}"
                )

            userinfo_data = response.json()
            logger.info(f"BohrApp: 获取用户信息响应: {userinfo_data}")

            # 检查 BohrApp API 响应状态
            if userinfo_data.get("code") != 0:
                error_msg = userinfo_data.get("msg", "Unknown error")
                logger.error(f"BohrApp: API 返回错误: {error_msg}")
                return AuthResult(success=False, error_code="BOHRAPP_API_ERROR", error_message=error_msg)

            # 解析用户信息
            user_info = self.parse_userinfo_response(userinfo_data)
            logger.info(f"BohrApp: 用户信息解析完成，用户ID: {user_info.id}, 用户名: {user_info.username}")
            return AuthResult(success=True, user_info=user_info)

        except requests.RequestException as e:
            logger.error(f"BohrApp: API 请求异常: {str(e)}")
            return AuthResult(success=False, error_code="NETWORK_ERROR", error_message=f"Network error: {str(e)}")
        except Exception as e:
            logger.error(f"BohrApp: accessKey 验证异常: {str(e)}")
            return AuthResult(
                success=False,
                error_code="TOKEN_VALIDATION_ERROR",
                error_message=f"AccessKey validation failed: {str(e)}",
            )

    def parse_userinfo_response(self, userinfo_data: Dict[str, Any]) -> UserInfo:
        """从 BohrApp userinfo API 响应解析用户信息

        响应格式示例:
        {
            "code": 0,
            "data": {
                "bohr_user_id": 14076,
                "user_id": "jtuoalmo",
                "name": "Haohui Que",
                "org_id": 14072
            }
        }
        """
        logger.info("BohrApp: 解析 userinfo API 响应中的用户信息")
        logger.info(f"BohrApp: userinfo 数据: {userinfo_data}")

        # 获取 data 字段中的用户信息
        data = userinfo_data.get("data", {})

        # BohrApp API 返回的用户信息结构
        user_id = data.get("user_id", "")
        bohr_user_id = data.get("bohr_user_id")
        name = data.get("name", "")
        org_id = data.get("org_id")

        user_info = UserInfo(
            id=str(bohr_user_id),  # 使用 bohr_user_id 作为主要标识符
            username=str(user_id),  # 使用 user_id 作为用户名
            email=None,  # BohrApp 响应中没有邮箱信息
            display_name=name,  # 使用 name 作为显示名称
            avatar_url=None,  # BohrApp 响应中没有头像信息
            roles=[],  # BohrApp 响应中没有角色信息
            extra={
                "org_id": org_id,
            },
        )

        logger.info(
            f"BohrApp: 解析结果 - ID: {user_info.id}, 用户名: {user_info.username}, 显示名称: {user_info.display_name}"
        )
        return user_info

    def parse_user_info(self, token_payload: Dict[str, Any]) -> UserInfo:
        """
        从 token payload 解析用户信息

        注意: BohrApp 不使用 JWT token，此方法主要用于接口兼容性
        实际用户信息通过 API 获取
        """
        logger.info("BohrApp: 解析 token payload 中的用户信息 (仅用于兼容性)")
        logger.info(f"BohrApp: payload 内容: {token_payload}")

        user_id = str(token_payload.get("bohr_user_id", token_payload.get("user_id", token_payload.get("sub", ""))))

        user_info = UserInfo(
            id=user_id,
            username=token_payload.get("user_id", user_id),
            email=token_payload.get("email"),
            display_name=token_payload.get("name", token_payload.get("username", "")),
            avatar_url=token_payload.get("avatar"),
            roles=token_payload.get("roles", []),
            extra=token_payload,
        )

        logger.info(f"BohrApp: 解析结果 - ID: {user_info.id}, 用户名: {user_info.username}")
        return user_info
