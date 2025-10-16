import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Optional

import jwt
import requests
from fastapi import Header, HTTPException, Query, status

from internal import configs

# Set up logger
logger = logging.getLogger(__name__)


@dataclass
class UserInfo:
    """User information data class"""

    id: str
    username: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    roles: Optional[list] = None
    extra: Optional[Dict[str, Any]] = None


@dataclass
class AuthResult:
    """Authentication result data class"""

    success: bool
    user_info: Optional[UserInfo] = None
    error_message: Optional[str] = None
    error_code: Optional[str] = None


class BaseAuthProvider(ABC):
    """Abstract base class for authentication providers"""

    def __init__(self, config: Dict[str, Any]) -> None:
        self.config = config
        self.issuer = config.get("Issuer")
        self.jwks_uri = config.get("JwksUri")
        self.algorithm = config.get("Algorithm", "RS256")
        self.audience = config.get("Audience")

    @abstractmethod
    def get_provider_name(self) -> str:
        """Get the provider name"""
        pass

    @abstractmethod
    def validate_token(self, access_token: str) -> AuthResult:
        """Validate the access_token and get user information"""
        pass

    @abstractmethod
    def parse_user_info(self, token_payload: Dict[str, Any]) -> UserInfo:
        """Parse user information from the token payload"""
        pass

    def get_jwks(self) -> Optional[Dict[str, Any]]:
        """Get JWKS public key information"""
        if not self.jwks_uri:
            logger.warning("JWKS URI not configured")
            return None

        logger.info(f"Getting JWKS information from {self.jwks_uri}...")
        try:
            response = requests.get(self.jwks_uri, timeout=10)
            response.raise_for_status()
            jwks_data = response.json()

            if isinstance(jwks_data, dict):
                logger.info(f"Successfully retrieved JWKS, containing {len(jwks_data.get('keys', []))} keys")
                return jwks_data
            else:
                logger.error("Invalid JWKS response format, not a dictionary type")
                return None
        except Exception as e:
            logger.error(f"Failed to get JWKS from {self.jwks_uri}: {e}")
            return None

    def decode_jwt_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Decode JWT token"""
        logger.info("Start decoding JWT token")
        try:
            # Get JWKS
            logger.info("Getting JWKS public key information...")
            jwks = self.get_jwks()
            if not jwks:
                logger.error("Unable to get JWKS public key information")
                return None

            # Get kid from token header
            logger.info("Parsing token header...")
            unverified_header = jwt.get_unverified_header(token)
            kid = unverified_header.get("kid")
            logger.info(f"Token header kid: {kid}")

            # Find the corresponding public key
            logger.info("Finding matching public key...")
            key = None
            for jwk in jwks.get("keys", []):
                if jwk.get("kid") == kid:
                    logger.info(f"Found matching public key, kid: {kid}")
                    key = jwt.algorithms.RSAAlgorithm.from_jwk(jwk)
                    break

            if not key:
                logger.error(f"No matching public key found, token kid: {kid}")
                return None

            # Validate and decode token
            logger.info(
                f"Verifying token with algorithm {self.algorithm}, issuer: {self.issuer}, audience: {self.audience}"
            )
            payload = jwt.decode(
                token,
                key,
                algorithms=[self.algorithm],
                audience=self.audience,
                issuer=self.issuer,
                options={"verify_exp": True},
            )
            logger.info(f"Token validation successful, payload sub: {payload.get('sub')}")
            return payload

        except jwt.ExpiredSignatureError:
            logger.warning("Token has expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid token: {e}")
            return None
        except Exception as e:
            logger.error(f"Token decoding error: {e}")
            return None

    def is_configured(self) -> bool:
        """Check if the provider is configured correctly"""
        is_valid = bool(self.issuer and self.audience)
        logger.info(
            f"Auth provider configuration check: issuer={self.issuer}, audience={self.audience}, valid={is_valid}"
        )
        return is_valid


def _get_auth_provider() -> BaseAuthProvider:
    """
    Get an authentication provider instance based on the configuration,
    and throw an error if the configuration is invalid
    """
    logger.info("Start initializing authentication provider...")
    auth_config = configs.Auth
    provider_name = auth_config.Provider.lower()
    logger.info(f"Configured authentication provider: {provider_name}")

    # First, check if the authentication provider type is supported
    match provider_name:
        case "casdoor":
            from .casdoor import CasdoorAuthProvider

            logger.info("Initializing Casdoor authentication provider")
            provider_config = auth_config.Casdoor.model_dump()
            logger.info(f"Casdoor configuration: {provider_config}")
            provider: BaseAuthProvider = CasdoorAuthProvider(provider_config)
        case "bohrium":
            from .bohrium import BohriumAuthProvider

            logger.info("Initializing Bohrium authentication provider")
            provider_config = auth_config.Bohrium.model_dump()
            logger.info(f"Bohrium configuration: {provider_config}")
            provider = BohriumAuthProvider(provider_config)
        case _:
            error_msg = f"Unsupported authentication provider type: {provider_name}"
            logger.error(error_msg)
            raise ValueError(error_msg)

    # Check if the authentication provider configuration is valid
    if not provider.is_configured():
        error_msg = f"Authentication provider {provider_name} configuration is invalid"
        logger.error(error_msg)
        raise ValueError(error_msg)

    logger.info(f"Authentication provider {provider_name} initialized and configuration check passed")
    return provider


# Global authentication provider instance
try:
    AuthProvider = _get_auth_provider()
except ValueError as e:
    logger.error(f"Authentication provider initialization failed: {e}")
    # Raise an exception to prevent further use of the uninitialized AuthProvider
    raise RuntimeError(f"Authentication provider initialization failed: {e}") from e


# === Unified Authentication Dependency Function ===
async def get_current_user(authorization: Optional[str] = Header(None)) -> str:
    """Get the current user ID from the Authorization header (for HTTP API)"""

    # Check Authorization header
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")

    # Parse Bearer token
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization header format")

    access_token = authorization[7:]  # Remove "Bearer " prefix

    # Validate token
    auth_result = AuthProvider.validate_token(access_token)
    if not auth_result.success or not auth_result.user_info:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=auth_result.error_message or "Token validation failed",
        )

    return auth_result.user_info.id


async def get_current_user_websocket(token: Optional[str] = Query(None, alias="token")) -> str:
    """Get the current user ID from the token in the query parameters (for WebSocket)"""

    # Check token
    if not token:
        raise Exception("Missing authentication token")

    # Validate token
    auth_result = AuthProvider.validate_token(token)
    if not auth_result.success or not auth_result.user_info:
        raise Exception(auth_result.error_message or "Token validation failed")

    return auth_result.user_info.id


def is_auth_configured() -> bool:
    """Check if the authentication service is configured"""
    return AuthProvider is not None
