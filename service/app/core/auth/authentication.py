import logging
from typing import Any, Dict, Optional

from app.middleware.auth import AuthProvider
from app.middleware.auth.casdoor import CasdoorAuthProvider

logger = logging.getLogger(__name__)


class AuthenticationService:
    @staticmethod
    def login_with_code(code: str, state: Optional[str] = None) -> Dict[str, Any]:
        """
        使用授权码进行登录 (Casdoor Authorization Code Flow)

        Args:
            code: Casdoor 返回的授权码
            state: 状态值 (可选)

        Returns:
            包含 access_token 和用户信息的字典
        """
        provider = AuthProvider

        if not provider:
            raise Exception("Authentication provider not initialized")

        if provider.get_provider_name() != "casdoor":
            raise Exception(f"Current provider '{provider.get_provider_name()}' does not support code login")

        if not isinstance(provider, CasdoorAuthProvider):
            raise Exception("Provider type mismatch")

        # 1. Exchange code for access token
        logger.info("Exchanging authorization code for access token...")
        access_token = provider.exchange_code_for_token(code)
        logger.info("Successfully obtained access token")

        # 2. Validate token to get user info (optional, but good for verification)
        logger.info("Validating obtained access token...")
        validation_result = provider.validate_token(access_token)

        if not validation_result.success:
            raise Exception(f"Token validation failed: {validation_result.error_message}")

        return {"access_token": access_token, "token_type": "Bearer", "user_info": validation_result.user_info}


authentication_service = AuthenticationService()
