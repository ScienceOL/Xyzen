import base64
import json
import logging
from dataclasses import dataclass
from typing import Any

import requests


from . import AuthResult, BaseAuthProvider, UserInfo

# 设置日志记录器
logger = logging.getLogger(__name__)


@dataclass
class LinkedAccount:
    """第三方绑定账户信息"""

    provider_name: str  # Provider name in Casdoor (e.g., "custom", "github")
    provider_display_name: str  # Display name (e.g., "Bohrium", "GitHub")
    user_id: str  # User ID on the third-party platform
    username: str | None = None
    email: str | None = None
    avatar_url: str | None = None
    provider_icon_url: str | None = None  # Provider icon/logo URL
    is_valid: bool | None = None  # Token validation status (None = not checked)


@dataclass
class ProviderConfig:
    """OAuth Provider 配置"""

    name: str
    display_name: str
    type: str  # e.g., "Custom", "GitHub", "Google"
    category: str  # e.g., "OAuth"
    custom_user_info_url: str | None = None
    client_id: str | None = None
    icon_url: str | None = None  # Provider logo/icon URL


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

        logger.debug("Casdoor: 认证服务已配置，开始验证token...")
        try:
            # 优先使用 /api/get-account 获取完整用户信息（包含 avatar）
            # 这个接口返回的数据比 /api/user 更完整
            account_info = self.get_account_info(access_token)

            if account_info:
                logger.debug(f"Casdoor: get-account 成功，包含字段: {list(account_info.keys())}")
                user_info = self._parse_account_info(account_info)

                # 如果没有 avatar 且用户有 Bohrium 绑定，尝试从 Bohrium 直接获取
                if not user_info.avatar_url and account_info.get("custom"):
                    logger.debug("Casdoor: avatar_url 为空，尝试从 Bohrium 获取头像...")
                    bohrium_avatar = self._fetch_avatar_from_bohrium(access_token, account_info)
                    if bohrium_avatar:
                        user_info.avatar_url = bohrium_avatar
                        logger.debug(f"Casdoor: 从 Bohrium 获取到 avatar: {bohrium_avatar}")

                logger.debug(
                    f"Casdoor: 用户信息解析完成，用户ID: {user_info.id}, 用户名: {user_info.username}, 头像: {user_info.avatar_url}"
                )
                return AuthResult(success=True, user_info=user_info)

            # Fallback: 使用 JWT payload
            logger.warning("Casdoor: get-account 失败，尝试从 JWT 解析")
            jwt_payload = self._decode_jwt_payload(access_token)
            if jwt_payload:
                logger.debug(f"Casdoor: JWT payload 解析成功，包含字段: {list(jwt_payload.keys())}")
                user_info = self.parse_user_info(jwt_payload)
                logger.debug(
                    f"Casdoor: 用户信息解析完成，用户ID: {user_info.id}, 用户名: {user_info.username}, 头像: {user_info.avatar_url}"
                )
                return AuthResult(success=True, user_info=user_info)

            # 最后尝试 /api/user
            logger.warning("Casdoor: JWT 解析失败，尝试 /api/user")
            userinfo_url = f"{self.api_base}/api/user"
            headers = {"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"}
            response = requests.get(userinfo_url, headers=headers, timeout=10)

            if response.status_code == 401:
                logger.warning("Casdoor: Token 无效或已过期")
                return AuthResult(success=False, error_code="INVALID_TOKEN", error_message="Invalid or expired token")

            if not response.ok:
                logger.error(f"Casdoor: userinfo API 请求失败: {response.status_code} - {response.text}")
                return AuthResult(
                    success=False, error_code="API_ERROR", error_message=f"Casdoor API error: {response.status_code}"
                )

            userinfo_data = response.json()
            if userinfo_data.get("status") == "error":
                error_msg = userinfo_data.get("msg", "Unknown error")
                logger.error(f"Casdoor: API 返回错误: {error_msg}")
                return AuthResult(success=False, error_code="CASDOOR_API_ERROR", error_message=error_msg)

            user_info = self.parse_userinfo_response(userinfo_data)
            logger.debug(
                f"Casdoor: 用户信息解析完成，用户ID: {user_info.id}, 用户名: {user_info.username}, 头像: {user_info.avatar_url}"
            )
            return AuthResult(success=True, user_info=user_info)

        except requests.RequestException as e:
            logger.error(f"Casdoor: API 请求异常: {str(e)}")
            return AuthResult(success=False, error_code="NETWORK_ERROR", error_message=f"Network error: {str(e)}")
        except Exception as e:
            logger.error(f"Casdoor: Token验证异常: {str(e)}")
            return AuthResult(
                success=False, error_code="TOKEN_VALIDATION_ERROR", error_message=f"Token validation failed: {str(e)}"
            )

    def _fetch_avatar_from_bohrium(self, access_token: str, account_info: dict[str, Any]) -> str | None:
        """尝试从 Bohrium 直接获取用户头像

        使用 Casdoor 存储的 originalToken 调用 Bohrium 的 userinfo 接口
        """
        try:
            # 获取 Bohrium 的原始 token
            original_token = account_info.get("originalToken")
            if not original_token:
                # 尝试从 properties 获取
                properties = account_info.get("properties") or {}
                original_token = properties.get("oauth_Custom_accessToken")

            if not original_token:
                logger.debug("Casdoor: 没有 Bohrium 的 originalToken，无法获取头像")
                return None

            # 获取 Bohrium userinfo URL
            userinfo_url = self.get_provider_userinfo_url("custom")
            if not userinfo_url:
                logger.debug("Casdoor: 没有配置 Bohrium userinfo URL")
                return None

            # 调用 Bohrium API
            headers = {"Authorization": f"Bearer {original_token}"}
            logger.debug(f"Casdoor: 调用 Bohrium userinfo: {userinfo_url}")
            response = requests.get(userinfo_url, headers=headers, timeout=10)

            if not response.ok:
                logger.warning(f"Casdoor: Bohrium userinfo 请求失败: {response.status_code}")
                return None

            data = response.json()
            logger.debug(f"Casdoor: Bohrium userinfo 响应: {list(data.keys())}")

            # Bohrium 格式: {"code": 0, "data": {"avatarUrl": "..."}}
            if data.get("code") == 0 and data.get("data"):
                user_data = data["data"]
                avatar_url = user_data.get("avatarUrl") or user_data.get("avatar_url") or user_data.get("avatar")
                if avatar_url:
                    logger.debug(f"Casdoor: 从 Bohrium 获取到 avatar: {avatar_url}")
                    return avatar_url

            return None
        except Exception as e:
            logger.error(f"Casdoor: 从 Bohrium 获取 avatar 失败: {e}")
            return None

    def _decode_jwt_payload(self, token: str) -> dict[str, Any] | None:
        """解码 JWT token 的 payload 部分（不验证签名，仅提取数据）"""
        try:
            # JWT 格式: header.payload.signature
            parts = token.split(".")
            if len(parts) != 3:
                logger.warning("Casdoor: Invalid JWT format")
                return None

            # Base64 解码 payload（第二部分）
            payload_b64 = parts[1]
            # 添加必要的 padding
            padding = 4 - len(payload_b64) % 4
            if padding != 4:
                payload_b64 += "=" * padding

            payload_bytes = base64.urlsafe_b64decode(payload_b64)
            payload = json.loads(payload_bytes.decode("utf-8"))
            return payload
        except Exception as e:
            logger.error(f"Casdoor: JWT payload 解码失败: {e}")
            return None

    def _parse_account_info(self, account_info: dict[str, Any]) -> UserInfo:
        """从 Casdoor /api/get-account 响应解析用户信息

        get-account 返回完整的用户数据，包括 avatar 字段
        """
        logger.debug("Casdoor: 解析 get-account 响应中的用户信息")
        logger.debug(f"Casdoor: account_info 全部字段: {list(account_info.keys())}")

        # Casdoor 用户数据结构
        user_id = account_info.get("id") or account_info.get("name") or ""
        username = account_info.get("name", "")
        display_name = account_info.get("displayName") or account_info.get("name", "")
        email = account_info.get("email")
        avatar_url = account_info.get("avatar")  # Casdoor 使用 avatar 字段

        logger.debug(f"Casdoor: 直接从 account_info 获取的 avatar: '{avatar_url}'")

        # 如果没有 avatar，尝试从 properties 中获取（可能是第三方登录保存的）
        if not avatar_url:
            properties = account_info.get("properties") or {}
            logger.debug(f"Casdoor: properties 全部字段: {list(properties.keys())}")

            # 尝试各种可能的第三方 avatar 字段 (Casdoor 可能使用不同的命名约定)
            avatar_keys = [
                "oauth_Custom_avatarUrl",  # Casdoor Custom provider (Bohrium)
                "oauth_GitHub_avatarUrl",
                "oauth_Google_avatarUrl",
                "oauth_custom_avatarUrl",  # lowercase variant
                "avatarUrl",  # direct field
                "avatar_url",  # snake_case
            ]
            for key in avatar_keys:
                if properties.get(key):
                    avatar_url = properties[key]
                    logger.debug(f"Casdoor: 从 properties['{key}'] 获取到 avatar: '{avatar_url}'")
                    break

            if not avatar_url:
                logger.warning("Casdoor: properties 中没有找到 avatar，尝试遍历所有 avatarUrl 相关字段")
                # 遍历所有包含 avatar 的字段
                for key, value in properties.items():
                    if "avatar" in key.lower() and value:
                        avatar_url = value
                        logger.debug(f"Casdoor: 从 properties['{key}'] 获取到 avatar: '{avatar_url}'")
                        break

        logger.debug(f"Casdoor: 最终解析的 avatar_url: '{avatar_url}'")

        user_info = UserInfo(
            id=user_id,
            username=username,
            email=email,
            display_name=display_name,
            avatar_url=avatar_url,
            roles=account_info.get("roles", []) if isinstance(account_info.get("roles"), list) else [],
            extra={
                "owner": account_info.get("owner"),
                "type": account_info.get("type"),
                "createdTime": account_info.get("createdTime"),
            },
        )

        logger.debug(
            f"Casdoor: 解析结果 - ID: {user_info.id}, 用户名: {user_info.username}, display_name: {user_info.display_name}, 头像: {user_info.avatar_url}"
        )
        return user_info

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
            avatar_url=userinfo_data.get("picture") or userinfo_data.get("avatar"),
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

        url = f"{self.api_base}/api/login/oauth/access_token"

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
        """从 token payload 解析用户信息

        Casdoor JWT payload 字段说明:
        - sub/id: 用户 ID
        - name: 用户名
        - displayName: 显示名称 (camelCase)
        - avatar: 头像 URL
        - email: 邮箱
        """
        logger.debug("Casdoor: 解析token payload中的用户信息")
        logger.debug(f"Casdoor: payload内容: {token_payload}")

        # Casdoor token 结构解析 - 同时支持 OIDC 标准字段和 Casdoor 原生字段
        user_id = token_payload.get("sub") or token_payload.get("id") or ""
        username = token_payload.get("preferred_username") or token_payload.get("name") or ""
        display_name = (
            token_payload.get("displayName")  # Casdoor 原生 (camelCase)
            or token_payload.get("display_name")  # snake_case
            or token_payload.get("name")  # OIDC 标准
            or username
        )
        avatar_url = (
            token_payload.get("picture")  # OIDC 标准
            or token_payload.get("avatar")  # Casdoor 原生
        )

        user_info = UserInfo(
            id=user_id,
            username=username,
            email=token_payload.get("email"),
            display_name=display_name,
            avatar_url=avatar_url,
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

        logger.debug(
            f"Casdoor: 解析结果 - ID: {user_info.id}, 用户名: {user_info.username}, 头像: {user_info.avatar_url}"
        )
        return user_info

    def get_account_info(self, access_token: str) -> dict[str, Any] | None:
        """获取完整的账户信息（包含第三方绑定）

        调用 Casdoor 的 /api/get-account 接口
        """
        url = f"{self.api_base}/api/get-account"
        headers = {"Authorization": f"Bearer {access_token}"}

        try:
            response = requests.get(url, headers=headers, timeout=10)
            if not response.ok:
                logger.error(f"Casdoor get-account failed: {response.status_code}")
                return None

            data = response.json()
            logger.debug(f"Casdoor get-account 原始响应 keys: {list(data.keys())}")

            if data.get("status") == "error":
                logger.error(f"Casdoor get-account error: {data.get('msg')}")
                return None

            account_data = data.get("data")
            if account_data:
                # 详细记录 avatar 相关字段
                logger.debug("Casdoor get-account 成功:")
                logger.debug(f"  - avatar: '{account_data.get('avatar')}'")
                logger.debug(f"  - displayName: '{account_data.get('displayName')}'")
                logger.debug(f"  - custom (Bohrium ID): '{account_data.get('custom')}'")

                # 记录 properties 中的 avatar 相关字段
                properties = account_data.get("properties") or {}
                avatar_props = {k: v for k, v in properties.items() if "avatar" in k.lower()}
                if avatar_props:
                    logger.debug(f"  - properties 中 avatar 相关: {avatar_props}")
                else:
                    logger.debug("  - properties 中没有 avatar 相关字段")
            else:
                logger.warning("Casdoor get-account: data 字段为空")

            return account_data
        except Exception as e:
            logger.error(f"Casdoor get-account exception: {e}")
            return None

    def get_linked_accounts(self, access_token: str) -> list[LinkedAccount]:
        """获取用户已绑定的第三方账户列表"""
        account_info = self.get_account_info(access_token)
        if not account_info:
            return []

        logger.debug(f"get_linked_accounts: account_info keys: {list(account_info.keys())}")

        # 一次性获取所有 OAuth providers 的配置
        providers_by_type = self.get_all_oauth_providers()

        linked_accounts: list[LinkedAccount] = []

        # Provider field mappings: casdoor_field -> (default_display_name, provider_type)
        provider_mappings = {
            "custom": ("Bohrium", "Custom"),
            "github": ("GitHub", "GitHub"),
            "google": ("Google", "Google"),
            "wechat": ("WeChat", "WeChat"),
            "qq": ("QQ", "QQ"),
            "dingtalk": ("DingTalk", "DingTalk"),
            "weibo": ("Weibo", "Weibo"),
            "gitlab": ("GitLab", "GitLab"),
            "gitee": ("Gitee", "Gitee"),
            "linkedin": ("LinkedIn", "LinkedIn"),
            "facebook": ("Facebook", "Facebook"),
            "twitter": ("Twitter", "Twitter"),
            "apple": ("Apple", "Apple"),
            "microsoft": ("Microsoft", "Microsoft"),
        }

        # Properties may contain additional OAuth info
        properties = account_info.get("properties", {}) or {}
        logger.debug(f"get_linked_accounts: properties keys: {list(properties.keys())}")

        # 主账户头像（可能是从第三方同步过来的）
        main_avatar = account_info.get("avatar")

        for field, (default_display_name, provider_type) in provider_mappings.items():
            value = account_info.get(field)
            if value:  # Has linked account
                logger.debug(f"get_linked_accounts: found linked account for {field}: {value}")

                # 从 providers 配置获取显示名称和图标
                provider_config = providers_by_type.get(provider_type.lower())
                display_name = (
                    provider_config.display_name
                    if provider_config and provider_config.display_name
                    else default_display_name
                )
                icon_url = provider_config.icon_url if provider_config else None

                # Try to get additional info from properties
                # Casdoor 可能使用不同的命名约定：Custom vs custom
                field_cap = field.capitalize()
                if field == "custom":
                    field_cap = "Custom"  # Casdoor 对 Custom provider 使用大写 Custom

                username = (
                    properties.get(f"oauth_{field_cap}_username")
                    or properties.get(f"oauth_{field_cap}_displayName")
                    or properties.get(f"oauth_{field.capitalize()}_username")
                    or properties.get(f"oauth_{field.capitalize()}_displayName")
                )
                email = properties.get(f"oauth_{field_cap}_email") or properties.get(
                    f"oauth_{field.capitalize()}_email"
                )
                avatar = (
                    properties.get(f"oauth_{field_cap}_avatarUrl")
                    or properties.get(f"oauth_{field.capitalize()}_avatarUrl")
                    or main_avatar  # 如果 properties 中没有，使用主账户头像
                )

                logger.debug(f"get_linked_accounts: {field} - username={username}, email={email}, avatar={avatar}")

                linked_accounts.append(
                    LinkedAccount(
                        provider_name=field,
                        provider_display_name=display_name,
                        user_id=str(value),
                        username=username,
                        email=email,
                        avatar_url=avatar,
                        provider_icon_url=icon_url,
                    )
                )

        return linked_accounts

    def get_all_oauth_providers(self) -> dict[str, ProviderConfig]:
        """获取所有 OAuth 类型的 Provider 配置

        Returns:
            dict mapping provider type (lowercase) to ProviderConfig
        """
        organization = getattr(self.config, "Organization", "scienceol")
        client_id = self.audience
        client_secret = getattr(self.config, "ClientSecret", None)

        if not client_secret:
            logger.warning("get_all_oauth_providers: ClientSecret not configured, cannot query Casdoor API")
            return {}

        providers_by_type: dict[str, ProviderConfig] = {}

        for owner in ["admin", organization]:
            url = f"{self.api_base}/api/get-providers"
            params = {
                "owner": owner,
                "clientId": client_id,
                "clientSecret": client_secret,
            }

            try:
                response = requests.get(url, params=params, timeout=10)
                if response.ok:
                    data = response.json()
                    if data.get("status") == "error":
                        logger.debug(f"get_all_oauth_providers: API error for owner {owner}: {data.get('msg')}")
                        continue
                    providers = data.get("data") or []
                    for provider_data in providers:
                        # 只处理 OAuth 类型的 provider
                        if provider_data.get("category") != "OAuth":
                            continue
                        provider_type = provider_data.get("type", "").lower()
                        if provider_type and provider_type not in providers_by_type:
                            providers_by_type[provider_type] = ProviderConfig(
                                name=provider_data.get("name", ""),
                                display_name=provider_data.get("displayName", ""),
                                type=provider_data.get("type", ""),
                                category=provider_data.get("category", ""),
                                custom_user_info_url=provider_data.get("customUserInfoUrl"),
                                client_id=provider_data.get("clientId"),
                                icon_url=provider_data.get("customLogo"),
                            )
                    # 找到 providers 后就返回，不再查询下一个 owner
                    if providers_by_type:
                        break
            except Exception as e:
                logger.debug(f"get_all_oauth_providers: Failed to get providers for owner {owner}: {e}")
                continue

        logger.debug(f"get_all_oauth_providers: Found {len(providers_by_type)} OAuth providers")
        return providers_by_type

    def get_provider_config(self, provider_name: str) -> ProviderConfig | None:
        """从 Casdoor 获取 OAuth Provider 配置

        调用 /api/get-provider 接口获取 provider 配置，包括 customUserInfoUrl
        """
        # Get organization from config
        organization = getattr(self.config, "Organization", "scienceol")

        # Build provider ID (Casdoor format: admin/provider-name or org/provider-name)
        # Try multiple possible names
        possible_names = [
            f"admin/provider_{provider_name}",
            f"{organization}/provider_{provider_name}",
            f"admin/{provider_name}",
            f"{organization}/{provider_name}",
        ]

        for provider_id in possible_names:
            url = f"{self.api_base}/api/get-provider"
            params = {"id": provider_id}

            try:
                response = requests.get(url, params=params, timeout=10)
                if response.ok:
                    data = response.json()
                    if data.get("status") != "error" and data.get("data"):
                        provider_data = data["data"]
                        return ProviderConfig(
                            name=provider_data.get("name", ""),
                            display_name=provider_data.get("displayName", ""),
                            type=provider_data.get("type", ""),
                            category=provider_data.get("category", ""),
                            custom_user_info_url=provider_data.get("customUserInfoUrl"),
                            client_id=provider_data.get("clientId"),
                        )
            except Exception as e:
                logger.debug(f"Failed to get provider {provider_id}: {e}")
                continue

        logger.warning(f"Provider config not found for: {provider_name}")
        return None

    def validate_third_party_token(
        self, provider_name: str, original_token: str, userinfo_url: str | None = None
    ) -> bool:
        """验证第三方 OAuth token 是否仍然有效

        Args:
            provider_name: Provider 名称 (e.g., "custom" for Bohrium)
            original_token: 第三方平台的原始 access token
            userinfo_url: 可选，直接提供 userinfo URL，否则从配置或 Casdoor 获取

        Returns:
            True if token is valid, False otherwise
        """
        logger.debug(f"validate_third_party_token: 验证 {provider_name} 的 token")

        # 1. 优先使用传入的 URL
        if not userinfo_url:
            # 2. 从 Casdoor 动态获取 userinfo URL
            userinfo_url = self.get_provider_userinfo_url(provider_name)
            if userinfo_url:
                logger.debug(
                    f"validate_third_party_token: 从 Casdoor 获取到 {provider_name} 的 userinfo URL: {userinfo_url}"
                )

        if not userinfo_url:
            logger.warning(f"validate_third_party_token: 无法获取 {provider_name} 的 userinfo URL，跳过验证")
            # 返回 True 以避免误报"过期"
            return True

        # Call the provider's userinfo endpoint
        try:
            headers = {"Authorization": f"Bearer {original_token}"}
            logger.debug(f"validate_third_party_token: 调用 {userinfo_url}")
            response = requests.get(userinfo_url, headers=headers, timeout=10)

            if not response.ok:
                logger.debug(
                    f"validate_third_party_token: {provider_name} token 验证失败 (HTTP {response.status_code})"
                )
                logger.debug(f"validate_third_party_token: 响应内容: {response.text[:200]}")
                return False

            # 解析响应，检查业务层面的成功状态
            try:
                data = response.json()
                # Bohrium 格式: {"code": 0, "data": {...}}
                if "code" in data:
                    is_valid = data.get("code") == 0
                    logger.debug(
                        f"validate_third_party_token: {provider_name} token 验证结果: {is_valid} (code: {data.get('code')})"
                    )
                    return is_valid
                # 其他格式：HTTP 200 即为成功
                logger.debug(f"validate_third_party_token: {provider_name} token 验证成功 (HTTP 200)")
                return True
            except Exception:
                # 无法解析 JSON，但 HTTP 200 也算成功
                logger.debug(f"validate_third_party_token: {provider_name} token 验证成功 (HTTP 200, non-JSON)")
                return True

        except Exception as e:
            logger.error(f"validate_third_party_token: 验证 {provider_name} token 失败: {e}")
            return False

    def get_original_tokens(self, access_token: str) -> dict[str, str]:
        """从 Casdoor 获取用户的第三方原始 token

        注意: Casdoor 可能不会存储第三方的原始 token，或者 token 可能已经过期。
        这个功能依赖于 Casdoor 的 originalToken 字段。

        Returns:
            dict mapping provider_name to original_token
        """
        account_info = self.get_account_info(access_token)
        if not account_info:
            logger.warning("get_original_tokens: 无法获取账户信息")
            return {}

        tokens = {}
        original_token = account_info.get("originalToken")

        logger.debug(f"get_original_tokens: originalToken 存在: {bool(original_token)}")

        if not original_token:
            logger.debug("get_original_tokens: Casdoor 没有存储 originalToken，尝试从 properties 获取")
            # 尝试从 properties 中获取（某些 Casdoor 版本可能存储在这里）
            properties = account_info.get("properties") or {}
            for provider in ["custom", "github", "google", "wechat"]:
                token_key = f"oauth_{provider.capitalize()}_accessToken"
                if provider == "custom":
                    token_key = "oauth_Custom_accessToken"
                if properties.get(token_key):
                    tokens[provider] = properties[token_key]
                    logger.debug(f"get_original_tokens: 从 properties 中找到 {provider} 的 token")
            return tokens

        # The originalToken is typically from the last OAuth login
        # We need to determine which provider it belongs to
        # Check which provider field is populated
        provider_fields = ["custom", "github", "google", "wechat", "qq", "dingtalk", "weibo", "gitlab", "gitee"]
        for provider in provider_fields:
            if account_info.get(provider):
                tokens[provider] = original_token
                logger.debug(
                    f"get_original_tokens: 找到 {provider} 的 originalToken (用户ID: {account_info.get(provider)})"
                )

        if not tokens:
            logger.warning("get_original_tokens: 有 originalToken 但无法确定属于哪个 provider")

        return tokens

    def get_provider_by_type(self, provider_type: str) -> ProviderConfig | None:
        """根据 provider 类型查找 Casdoor 中的 provider

        Args:
            provider_type: Provider 类型 (e.g., "Custom", "GitHub")

        Returns:
            ProviderConfig if found, None otherwise
        """
        organization = getattr(self.config, "Organization", "scienceol")
        client_id = self.audience
        client_secret = getattr(self.config, "ClientSecret", None)

        if not client_secret:
            logger.warning("get_provider_by_type: ClientSecret not configured, cannot query Casdoor API")
            return None

        # Query all providers for the organization
        for owner in ["admin", organization]:
            url = f"{self.api_base}/api/get-providers"
            params = {
                "owner": owner,
                "clientId": client_id,
                "clientSecret": client_secret,
            }

            try:
                response = requests.get(url, params=params, timeout=10)
                if response.ok:
                    data = response.json()
                    if data.get("status") == "error":
                        logger.debug(f"get_provider_by_type: API error for owner {owner}: {data.get('msg')}")
                        continue
                    providers = data.get("data") or []
                    for provider_data in providers:
                        # Match by type (case-insensitive)
                        if provider_data.get("type", "").lower() == provider_type.lower():
                            logger.debug(
                                f"get_provider_by_type: Found provider for type '{provider_type}': name='{provider_data.get('name')}'"
                            )
                            return ProviderConfig(
                                name=provider_data.get("name", ""),
                                display_name=provider_data.get("displayName", ""),
                                type=provider_data.get("type", ""),
                                category=provider_data.get("category", ""),
                                custom_user_info_url=provider_data.get("customUserInfoUrl"),
                                client_id=provider_data.get("clientId"),
                                icon_url=provider_data.get("customLogo"),
                            )
            except Exception as e:
                logger.debug(f"get_provider_by_type: Failed to get providers for owner {owner}: {e}")
                continue

        logger.warning(f"get_provider_by_type: Provider not found for type: {provider_type}")
        return None

    def get_provider_userinfo_url(self, provider_type: str) -> str | None:
        """根据 provider 类型获取 userinfo URL

        Args:
            provider_type: Provider 类型 (e.g., "custom", "github")

        Returns:
            Userinfo URL if found, None otherwise
        """
        provider_config = self.get_provider_by_type(provider_type)
        return provider_config.custom_user_info_url if provider_config else None

    def get_link_url(self, provider_type: str, redirect_uri: str) -> str:
        """生成第三方账户重新授权 URL

        通过重新执行 OAuth 登录流程来刷新第三方 token。
        指定 provider 参数可以直接跳转到对应的第三方登录。

        Args:
            provider_type: Provider 类型 (e.g., "Custom", "GitHub")
            redirect_uri: 登录完成后的回调地址

        Returns:
            Casdoor OAuth 授权 URL
        """
        # Query Casdoor API to get the actual provider name
        provider_name = provider_type  # fallback
        provider_config = self.get_provider_by_type(provider_type)
        if provider_config and provider_config.name:
            provider_name = provider_config.name
            logger.debug(f"get_link_url: Resolved provider type '{provider_type}' to name '{provider_name}'")
        else:
            logger.warning(f"get_link_url: Could not resolve provider type '{provider_type}', using as-is")

        return (
            f"{self.issuer}/login/oauth/authorize"
            f"?client_id={self.audience}"
            f"&response_type=code"
            f"&redirect_uri={redirect_uri}"
            f"&scope=openid profile email"
            f"&state=relink_{provider_type}"
            f"&provider={provider_name}"
        )

    def upload_avatar(
        self, access_token: str, file_data: bytes, filename: str, content_type: str = "image/png"
    ) -> str | None:
        """上传头像到 Casdoor 存储

        Args:
            access_token: 用户的 access token
            file_data: 图片文件数据
            filename: 文件名
            content_type: MIME 类型

        Returns:
            上传后的头像 URL，失败返回 None
        """
        # 先获取用户信息以获取 owner 和 name
        account_info = self.get_account_info(access_token)
        if not account_info:
            logger.error("Failed to get account info for avatar upload")
            return None

        owner = account_info.get("owner", "")
        name = account_info.get("name", "")

        if not owner or not name:
            logger.error("Missing owner or name in account info")
            return None

        # Casdoor upload resource API
        url = f"{self.api_base}/api/upload-resource"

        # 构建 multipart form data
        files = {"file": (filename, file_data, content_type)}

        # Casdoor 需要的参数
        data = {
            "owner": owner,
            "user": name,
            "application": getattr(self.config, "Application", "scienceol"),
            "tag": "avatar",
            "parent": "",
            "fullFilePath": f"avatar/{owner}/{name}/{filename}",
        }

        headers = {"Authorization": f"Bearer {access_token}"}

        try:
            response = requests.post(url, files=files, data=data, headers=headers, timeout=30)

            if not response.ok:
                logger.error(f"Casdoor upload failed: {response.status_code} - {response.text}")
                return None

            result = response.json()
            if result.get("status") == "error":
                logger.error(f"Casdoor upload error: {result.get('msg')}")
                return None

            # 返回上传后的 URL
            file_url = result.get("data")
            if file_url:
                logger.debug(f"Avatar uploaded successfully: {file_url}")
                return file_url

            # 有些版本的 Casdoor 返回格式不同
            if result.get("data2"):
                return result.get("data2")

            return None

        except Exception as e:
            logger.error(f"Avatar upload exception: {e}")
            return None

    def update_user_avatar(self, access_token: str, avatar_url: str) -> bool:
        """更新用户头像 URL

        Args:
            access_token: 用户的 access token
            avatar_url: 新的头像 URL

        Returns:
            是否更新成功
        """
        # 获取完整的用户信息
        account_info = self.get_account_info(access_token)
        if not account_info:
            logger.error("Failed to get account info for avatar update")
            return False

        # 更新头像字段
        account_info["avatar"] = avatar_url

        # Casdoor update user API
        url = f"{self.api_base}/api/update-user"

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        # Casdoor 需要 id 参数
        params = {"id": f"{account_info.get('owner')}/{account_info.get('name')}"}

        try:
            response = requests.post(url, json=account_info, headers=headers, params=params, timeout=10)

            if not response.ok:
                logger.error(f"Casdoor update user failed: {response.status_code} - {response.text}")
                return False

            result = response.json()
            if result.get("status") == "error":
                logger.error(f"Casdoor update user error: {result.get('msg')}")
                return False

            logger.debug("User avatar updated successfully")
            return True

        except Exception as e:
            logger.error(f"Update user avatar exception: {e}")
            return False

    def update_user_display_name(self, access_token: str, display_name: str) -> bool:
        """更新用户显示名称

        Args:
            access_token: 用户的 access token
            display_name: 新的显示名称

        Returns:
            是否更新成功
        """
        # 获取完整的用户信息
        account_info = self.get_account_info(access_token)
        if not account_info:
            logger.error("Failed to get account info for display name update")
            return False

        # 更新显示名称字段
        account_info["displayName"] = display_name

        # Casdoor update user API
        url = f"{self.api_base}/api/update-user"

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        # Casdoor 需要 id 参数
        params = {"id": f"{account_info.get('owner')}/{account_info.get('name')}"}

        try:
            response = requests.post(url, json=account_info, headers=headers, params=params, timeout=10)

            if not response.ok:
                logger.error(f"Casdoor update display name failed: {response.status_code} - {response.text}")
                return False

            result = response.json()
            if result.get("status") == "error":
                logger.error(f"Casdoor update display name error: {result.get('msg')}")
                return False

            logger.debug(f"User display name updated successfully to: {display_name}")
            return True

        except Exception as e:
            logger.error(f"Update user display name exception: {e}")
            return False
