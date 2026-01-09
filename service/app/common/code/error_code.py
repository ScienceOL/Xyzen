"""LLM chat error codes and helpers."""

from __future__ import annotations

from enum import IntEnum
from typing import Tuple

from fastapi import HTTPException


class ErrCode(IntEnum):
    """Comprehensive error codes organized by domain and operation type."""

    # ========== GENERIC SYSTEM ERRORS (0-99) ==========
    SUCCESS = 0
    UNKNOWN_ERROR = 1
    INTERNAL_SERVER_ERROR = 2
    SERVICE_UNAVAILABLE = 3
    MAINTENANCE_MODE = 4

    # ========== REQUEST VALIDATION (1xxx) ==========
    # Use when: Request format, payload, or parameter validation fails
    INVALID_REQUEST = 1000  # Malformed request structure
    MISSING_REQUIRED_FIELD = 1001  # Required field not provided
    INVALID_FIELD_VALUE = 1002  # Field value doesn't meet constraints
    INVALID_UUID_FORMAT = 1003  # UUID parameter is malformed
    PAYLOAD_TOO_LARGE = 1004  # Request payload exceeds size limits
    UNSUPPORTED_CONTENT_TYPE = 1005  # Content-Type not supported
    EMPTY_MESSAGE = 1010  # Message content is empty (chat specific)
    MALFORMED_PAYLOAD = 1011  # JSON/payload parsing failed

    # ========== AUTHENTICATION (2xxx) ==========
    # Use when: User identity verification fails
    AUTHENTICATION_REQUIRED = 2000  # No auth token provided
    INVALID_TOKEN = 2001  # Token format is invalid
    TOKEN_EXPIRED = 2002  # Token has expired
    TOKEN_REVOKED = 2003  # Token has been revoked
    AUTHENTICATION_FAILED = 2004  # General auth failure
    INSUFFICIENT_PRIVILEGES = 2005  # User doesn't have required role/scope

    # ========== SESSION MANAGEMENT (3xxx) ==========
    # Use when: Session-related operations fail
    SESSION_NOT_FOUND = 3000  # Session ID doesn't exist
    SESSION_EXPIRED = 3001  # Session has timed out
    SESSION_ACCESS_DENIED = 3002  # User can't access this session
    SESSION_LIMIT_EXCEEDED = 3003  # Too many active sessions
    SESSION_CREATION_FAILED = 3004  # Failed to create new session

    # ========== TOPIC MANAGEMENT (4xxx) ==========
    # Use when: Topic operations fail
    TOPIC_NOT_FOUND = 4000  # Topic ID doesn't exist
    TOPIC_ACCESS_DENIED = 4001  # User can't access this topic
    TOPIC_NOT_OWNED = 4002  # User doesn't own this topic
    TOPIC_CREATION_FAILED = 4003  # Failed to create topic
    TOPIC_UPDATE_FAILED = 4004  # Failed to update topic
    TOPIC_DELETE_FAILED = 4005  # Failed to delete topic

    # ========== PROVIDER MANAGEMENT (5xxx) ==========
    # Use when: LLM provider operations fail
    PROVIDER_NOT_FOUND = 5000  # Provider ID doesn't exist
    PROVIDER_ACCESS_DENIED = 5001  # User can't access this provider
    PROVIDER_NOT_OWNED = 5002  # User doesn't own this provider
    PROVIDER_SYSTEM_READONLY = 5003  # System provider can't be modified
    PROVIDER_NOT_CONFIGURED = 5010  # Provider missing configuration
    PROVIDER_NOT_AVAILABLE = 5011  # Provider service is down
    PROVIDER_AUTHENTICATION_FAILED = 5012  # Provider API key invalid
    PROVIDER_RATE_LIMITED = 5013  # Provider API rate limit hit
    PROVIDER_QUOTA_EXCEEDED = 5014  # Provider quota/billing limit hit

    # ========== MODEL MANAGEMENT (6xxx) ==========
    # Use when: AI model operations fail
    MODEL_NOT_AVAILABLE = 6000  # Requested model doesn't exist
    MODEL_NOT_SUPPORTED = 6001  # Model not supported by provider
    MODEL_NOT_SPECIFIED = 6002  # Model parameter not provided
    MODEL_OVERLOADED = 6003  # Model temporarily unavailable
    MODEL_CONFIGURATION_ERROR = 6004  # Invalid model parameters
    MODEL_CONTEXT_TOO_LONG = 6005  # Input exceeds model context limit
    MODEL_OUTPUT_TRUNCATED = 6006  # Response was truncated

    # ========== AGENT MANAGEMENT (7xxx) ==========
    # Use when: Agent operations fail
    AGENT_NOT_FOUND = 7000  # Agent ID doesn't exist
    AGENT_ACCESS_DENIED = 7001  # User can't access this agent
    AGENT_NOT_OWNED = 7002  # User doesn't own this agent
    AGENT_NOT_BOUND = 7003  # Agent not bound to session/topic
    AGENT_CREATION_FAILED = 7004  # Failed to create agent
    AGENT_UPDATE_FAILED = 7005  # Failed to update agent
    AGENT_DELETE_FAILED = 7006  # Failed to delete agent
    AGENT_EXECUTION_ERROR = 7007  # Error during agent execution

    # ========== GRAPH AGENT MANAGEMENT (8xxx) ==========
    # Use when: Graph agent operations fail
    GRAPH_AGENT_NOT_FOUND = 8000  # Graph agent ID doesn't exist
    GRAPH_AGENT_ACCESS_DENIED = 8001  # User can't access this graph agent
    GRAPH_AGENT_NOT_OWNED = 8002  # User doesn't own this graph agent
    GRAPH_AGENT_INVALID_SCHEMA = 8003  # State schema validation failed
    GRAPH_NODE_NOT_FOUND = 8010  # Graph node doesn't exist
    GRAPH_NODE_INVALID_CONFIG = 8011  # Node configuration is invalid
    GRAPH_EDGE_NOT_FOUND = 8020  # Graph edge doesn't exist
    GRAPH_EDGE_INVALID_CONDITION = 8021  # Edge condition is invalid
    GRAPH_EXECUTION_FAILED = 8030  # Graph execution error
    GRAPH_CYCLE_DETECTED = 8031  # Circular dependency in graph

    # ========== TOOL EXECUTION (9xxx) ==========
    # Use when: Tool/function call operations fail
    TOOL_NOT_FOUND = 9000  # Tool doesn't exist
    TOOL_ACCESS_DENIED = 9001  # User can't use this tool
    TOOL_CONFIRMATION_REQUIRED = 9002  # Tool requires user confirmation
    TOOL_EXECUTION_FAILED = 9003  # Tool execution error
    TOOL_TIMEOUT = 9004  # Tool execution timed out
    TOOL_RESULT_PARSING_FAILED = 9005  # Tool result format invalid
    TOOL_PARAMETER_INVALID = 9006  # Tool parameters are invalid
    TOOL_RESOURCE_UNAVAILABLE = 9007  # Tool dependencies unavailable

    # ========== MCP SERVER MANAGEMENT (10xxx) ==========
    # Use when: MCP server operations fail
    MCP_SERVER_NOT_FOUND = 10000  # MCP server doesn't exist
    MCP_SERVER_ACCESS_DENIED = 10001  # User can't access MCP server
    MCP_SERVER_UNAVAILABLE = 10002  # MCP server is down
    MCP_SERVER_CONNECTION_FAILED = 10003  # Can't connect to MCP server
    MCP_SERVER_PROTOCOL_ERROR = 10004  # MCP protocol violation
    MCP_TOOL_NOT_FOUND = 10010  # Tool not found on MCP server
    MCP_RESOURCE_NOT_FOUND = 10011  # Resource not found on MCP server

    # ========== STREAMING OPERATIONS (11xxx) ==========
    # Use when: Real-time streaming fails
    STREAM_NOT_FOUND = 11000  # Stream ID doesn't exist
    STREAM_INTERRUPTED = 11001  # Stream was interrupted
    STREAM_TIMEOUT = 11002  # Stream timed out
    STREAM_CHANNEL_CLOSED = 11003  # WebSocket/channel closed
    STREAM_RATE_LIMITED = 11004  # Too many concurrent streams
    STREAM_BUFFER_OVERFLOW = 11005  # Stream buffer is full
    STREAM_FORMAT_ERROR = 11006  # Stream data format error

    # ========== FILE/RESOURCE OPERATIONS (12xxx) ==========
    # Use when: File upload/download operations fail
    FILE_NOT_FOUND = 12000  # File doesn't exist
    FILE_ACCESS_DENIED = 12001  # User can't access file
    FILE_TOO_LARGE = 12002  # File exceeds size limit
    FILE_TYPE_NOT_SUPPORTED = 12003  # File type not allowed
    FILE_UPLOAD_FAILED = 12004  # File upload error
    FILE_PROCESSING_FAILED = 12005  # File processing error
    STORAGE_QUOTA_EXCEEDED = 12006  # User storage limit reached
    STORAGE_UNAVAILABLE = 12007  # Storage system unavailable

    # ========== FOLDER MANAGEMENT (125xx) ==========
    # Use when: Folder operations fail
    FOLDER_NOT_FOUND = 12500  # Folder doesn't exist
    FOLDER_ACCESS_DENIED = 12501  # User can't access folder
    FOLDER_CREATION_FAILED = 12502  # Failed to create folder
    FOLDER_UPDATE_FAILED = 12503  # Failed to update folder
    FOLDER_DELETE_FAILED = 12504  # Failed to delete folder

    # ========== KNOWLEDGE SET MANAGEMENT (126xx) ==========
    # Use when: Knowledge set operations fail
    KNOWLEDGE_SET_NOT_FOUND = 12600  # Knowledge set doesn't exist
    KNOWLEDGE_SET_ACCESS_DENIED = 12601  # User can't access knowledge set
    KNOWLEDGE_SET_CREATION_FAILED = 12602  # Failed to create knowledge set
    KNOWLEDGE_SET_UPDATE_FAILED = 12603  # Failed to update knowledge set
    KNOWLEDGE_SET_DELETE_FAILED = 12604  # Failed to delete knowledge set
    KNOWLEDGE_SET_LINK_EXISTS = 12605  # File already linked to knowledge set
    KNOWLEDGE_SET_LINK_NOT_FOUND = 12606  # Link doesn't exist

    # ========== BILLING / CONSUMPTION (13xxx) ==========
    # Use when: Billing or credit consumption fails
    INSUFFICIENT_BALANCE = 13000  # User has insufficient credits/balance

    # ========== REDEMPTION CODE (14xxx) ==========
    # Use when: Redemption code operations fail
    REDEMPTION_CODE_NOT_FOUND = 14000  # Redemption code doesn't exist
    REDEMPTION_CODE_INACTIVE = 14001  # Redemption code is not active
    REDEMPTION_CODE_EXPIRED = 14002  # Redemption code has expired
    REDEMPTION_CODE_MAX_USAGE = 14003  # Redemption code reached max usage
    REDEMPTION_CODE_ALREADY_USED = 14004  # User already redeemed this code
    REDEMPTION_CODE_ALREADY_EXISTS = 14005  # Code already exists (duplicate)
    INVALID_PARAMETER = 14006  # Invalid parameter provided

    # ========== CHECK-IN (14100-14199) ==========
    # Use when: Check-in operations fail
    ALREADY_CHECKED_IN_TODAY = 14100  # User has already checked in today

    # ========== OSS (OBJECT STORAGE SERVICE) (15xxx) ==========
    # Use when: OSS operations fail
    OSS_UPLOAD_FAILED = 15000  # Failed to upload file to OSS
    OSS_DOWNLOAD_FAILED = 15001  # Failed to download file from OSS
    OSS_DELETE_FAILED = 15002  # Failed to delete file from OSS
    OSS_BUCKET_NOT_FOUND = 15003  # OSS bucket doesn't exist
    OSS_BUCKET_ACCESS_DENIED = 15004  # No permission to access bucket
    OSS_OBJECT_NOT_FOUND = 15005  # Object doesn't exist in OSS
    OSS_OBJECT_ACCESS_DENIED = 15006  # No permission to access object
    OSS_AUTHENTICATION_FAILED = 15007  # OSS credentials invalid
    OSS_CONFIGURATION_ERROR = 15008  # OSS configuration is invalid
    OSS_CONNECTION_FAILED = 15009  # Can't connect to OSS service
    OSS_SERVICE_UNAVAILABLE = 15010  # OSS service is temporarily unavailable
    OSS_QUOTA_EXCEEDED = 15011  # OSS storage quota exceeded
    OSS_INVALID_OBJECT_KEY = 15012  # Object key format is invalid
    OSS_PRESIGNED_URL_EXPIRED = 15013  # Pre-signed URL has expired
    OSS_PRESIGNED_URL_INVALID = 15014  # Pre-signed URL is invalid
    OSS_MULTIPART_UPLOAD_FAILED = 15015  # Multipart upload operation failed
    OSS_OBJECT_TOO_LARGE = 15016  # Object exceeds size limit
    OSS_METADATA_ERROR = 15017  # Object metadata operation failed

    def with_messages(self, *messages: str) -> "ErrCodeError":
        """Return an ErrCodeError containing extra human messages."""

        return ErrCodeError(self, messages)

    def with_errors(self, *errors: BaseException) -> "ErrCodeError":
        """Wrap other exceptions as message payloads for this code."""

        extracted = tuple(str(err) for err in errors if err)
        return ErrCodeError(self, extracted)


class ErrCodeError(Exception):
    """Exception carrying an ErrCode and optional detail strings."""

    def __init__(self, code: ErrCode, messages: Tuple[str, ...] = ()):
        self.code = code
        # Clean empty messages
        self.messages = tuple(msg for msg in messages if msg)
        super().__init__(self._format())

    def _format(self) -> str:
        if not self.messages:
            return f"{self.code.name} ({self.code.value})"
        joined = " | ".join(self.messages)
        return f"{self.code.name} ({self.code.value}): {joined}"

    def as_dict(self) -> dict[str, object]:
        """Return a serialisable representation for response payloads."""

        if not self.messages:
            return {"msg": self.code.name.replace("_", " ").title(), "info": []}

        primary, *rest = self.messages
        payload: dict[str, object] = {"msg": primary}
        if rest:
            payload["info"] = rest
        return payload


def handle_auth_error(error: ErrCodeError) -> HTTPException:
    """Convert ErrCodeError to HTTP exception"""
    # Map error codes to HTTP status codes
    status_map = {
        # 401 errors
        ErrCode.AUTHENTICATION_REQUIRED: 401,
        ErrCode.INVALID_TOKEN: 401,
        ErrCode.TOKEN_EXPIRED: 401,
        ErrCode.TOKEN_REVOKED: 401,
        ErrCode.AUTHENTICATION_FAILED: 401,
        # 400 errors
        ErrCode.INVALID_REQUEST: 400,
        ErrCode.MISSING_REQUIRED_FIELD: 400,
        ErrCode.INVALID_FIELD_VALUE: 400,
        ErrCode.INVALID_UUID_FORMAT: 400,
        ErrCode.PAYLOAD_TOO_LARGE: 413,
        ErrCode.UNSUPPORTED_CONTENT_TYPE: 415,
        # 404 errors
        ErrCode.PROVIDER_NOT_FOUND: 404,
        ErrCode.AGENT_NOT_FOUND: 404,
        ErrCode.TOPIC_NOT_FOUND: 404,
        ErrCode.SESSION_NOT_FOUND: 404,
        ErrCode.GRAPH_AGENT_NOT_FOUND: 404,
        ErrCode.FOLDER_NOT_FOUND: 404,
        ErrCode.FILE_NOT_FOUND: 404,
        # 403 errors
        ErrCode.PROVIDER_ACCESS_DENIED: 403,
        ErrCode.PROVIDER_NOT_OWNED: 403,
        ErrCode.PROVIDER_SYSTEM_READONLY: 403,
        ErrCode.AGENT_ACCESS_DENIED: 403,
        ErrCode.AGENT_NOT_OWNED: 403,
        ErrCode.TOPIC_ACCESS_DENIED: 403,
        ErrCode.SESSION_ACCESS_DENIED: 403,
        ErrCode.GRAPH_AGENT_ACCESS_DENIED: 403,
        ErrCode.GRAPH_AGENT_NOT_OWNED: 403,
        ErrCode.FOLDER_ACCESS_DENIED: 403,
        ErrCode.FILE_ACCESS_DENIED: 403,
        # 402 errors
        ErrCode.INSUFFICIENT_BALANCE: 402,
        # 404 errors (redemption)
        ErrCode.REDEMPTION_CODE_NOT_FOUND: 404,
        # 400 errors (redemption)
        ErrCode.REDEMPTION_CODE_INACTIVE: 400,
        ErrCode.REDEMPTION_CODE_EXPIRED: 400,
        ErrCode.REDEMPTION_CODE_MAX_USAGE: 400,
        ErrCode.REDEMPTION_CODE_ALREADY_USED: 400,
        ErrCode.REDEMPTION_CODE_ALREADY_EXISTS: 409,
        ErrCode.INVALID_PARAMETER: 400,
        # 400 errors (check-in)
        ErrCode.ALREADY_CHECKED_IN_TODAY: 400,
        # 404 errors (OSS)
        ErrCode.OSS_BUCKET_NOT_FOUND: 404,
        ErrCode.OSS_OBJECT_NOT_FOUND: 404,
        # 403 errors (OSS)
        ErrCode.OSS_BUCKET_ACCESS_DENIED: 403,
        ErrCode.OSS_OBJECT_ACCESS_DENIED: 403,
        # 401 errors (OSS)
        ErrCode.OSS_AUTHENTICATION_FAILED: 401,
        # 400 errors (OSS)
        ErrCode.OSS_INVALID_OBJECT_KEY: 400,
        ErrCode.OSS_PRESIGNED_URL_EXPIRED: 400,
        ErrCode.OSS_PRESIGNED_URL_INVALID: 400,
        ErrCode.OSS_METADATA_ERROR: 400,
        # 413 errors (OSS)
        ErrCode.OSS_OBJECT_TOO_LARGE: 413,
        # 507 errors (OSS)
        ErrCode.OSS_QUOTA_EXCEEDED: 507,
        # 503 errors (OSS)
        ErrCode.OSS_SERVICE_UNAVAILABLE: 503,
        # 500 errors (OSS)
        ErrCode.OSS_UPLOAD_FAILED: 500,
        ErrCode.OSS_DOWNLOAD_FAILED: 500,
        ErrCode.OSS_DELETE_FAILED: 500,
        ErrCode.OSS_CONFIGURATION_ERROR: 500,
        ErrCode.OSS_CONNECTION_FAILED: 500,
        ErrCode.OSS_MULTIPART_UPLOAD_FAILED: 500,
    }

    status_code = status_map.get(error.code, 500)

    return HTTPException(
        status_code=status_code,
        detail=error.as_dict(),
    )


__all__ = ["ErrCode", "ErrCodeError", "handle_auth_error"]
