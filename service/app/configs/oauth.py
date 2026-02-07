from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class OAuthProviderInfo(BaseModel):
    """单个 OAuth Provider 的配置信息"""

    UserinfoUrl: str = Field(
        default="",
        description="OAuth provider 的 userinfo 端点，用于验证第三方 token",
    )
    DisplayName: str = Field(
        default="",
        description="Provider 显示名称",
    )
    IconUrl: str = Field(
        default="",
        description="Provider 图标 URL",
    )


class OAuthProvidersConfig(BaseSettings):
    """OAuth Provider 配置

    用于配置各个第三方 OAuth Provider 的 userinfo URL，
    以便验证用户绑定的第三方账户 token 是否仍然有效。

    配置方式：
    - 环境变量: XYZEN_OAUTH_CUSTOM_USERINFOURL=https://...
    - 或在 .env 文件中配置
    """

    model_config = SettingsConfigDict(
        env_nested_delimiter="_",
        case_sensitive=False,
        extra="ignore",  # 允许额外字段，方便扩展
    )

    # Bohrium (Custom provider in Casdoor)
    Custom: OAuthProviderInfo = Field(
        default_factory=lambda: OAuthProviderInfo(
            UserinfoUrl="https://www.bohrium.com/bohrapi/v1/account/info",
            DisplayName="Bohrium",
            IconUrl="https://storage.sciol.ac.cn/library/browser-fav.png",
        ),
        description="Bohrium (Custom) OAuth provider 配置",
    )

    # GitHub
    GitHub: OAuthProviderInfo = Field(
        default_factory=lambda: OAuthProviderInfo(
            UserinfoUrl="https://api.github.com/user",
            DisplayName="GitHub",
            IconUrl="https://github.githubassets.com/favicons/favicon.svg",
        ),
        description="GitHub OAuth provider 配置",
    )

    # Google
    Google: OAuthProviderInfo = Field(
        default_factory=lambda: OAuthProviderInfo(
            UserinfoUrl="https://www.googleapis.com/oauth2/v3/userinfo",
            DisplayName="Google",
            IconUrl="https://www.google.com/favicon.ico",
        ),
        description="Google OAuth provider 配置",
    )

    # WeChat
    WeChat: OAuthProviderInfo = Field(
        default_factory=lambda: OAuthProviderInfo(
            UserinfoUrl="https://api.weixin.qq.com/sns/userinfo",
            DisplayName="WeChat",
            IconUrl="https://res.wx.qq.com/a/wx_fed/assets/res/NTI4MWU5.ico",
        ),
        description="WeChat OAuth provider 配置",
    )

    # GitLab
    GitLab: OAuthProviderInfo = Field(
        default_factory=lambda: OAuthProviderInfo(
            UserinfoUrl="https://gitlab.com/api/v4/user",
            DisplayName="GitLab",
            IconUrl="https://gitlab.com/assets/favicon-72a2cad5025aa931d6ea56c3201d1f18e68a8571fc4fa9c40a5a4fe1f6b22dc6.ico",
        ),
        description="GitLab OAuth provider 配置",
    )

    # Gitee
    Gitee: OAuthProviderInfo = Field(
        default_factory=lambda: OAuthProviderInfo(
            UserinfoUrl="https://gitee.com/api/v5/user",
            DisplayName="Gitee",
            IconUrl="https://gitee.com/favicon.ico",
        ),
        description="Gitee OAuth provider 配置",
    )

    def get_userinfo_url(self, provider_name: str) -> str | None:
        """根据 provider 名称获取 userinfo URL"""
        provider_info = self._get_provider_info(provider_name)
        return provider_info.UserinfoUrl if provider_info and provider_info.UserinfoUrl else None

    def get_icon_url(self, provider_name: str) -> str | None:
        """根据 provider 名称获取图标 URL"""
        provider_info = self._get_provider_info(provider_name)
        return provider_info.IconUrl if provider_info and provider_info.IconUrl else None

    def get_display_name(self, provider_name: str) -> str | None:
        """根据 provider 名称获取显示名称"""
        provider_info = self._get_provider_info(provider_name)
        return provider_info.DisplayName if provider_info and provider_info.DisplayName else None

    def _get_provider_info(self, provider_name: str) -> OAuthProviderInfo | None:
        """根据 provider 名称获取配置信息"""
        provider_map = {
            "custom": self.Custom,
            "github": self.GitHub,
            "google": self.Google,
            "wechat": self.WeChat,
            "gitlab": self.GitLab,
            "gitee": self.Gitee,
        }
        return provider_map.get(provider_name.lower())
