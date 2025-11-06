from fastapi import HTTPException
from common.code import ErrCode, ErrCodeError


def handle_auth_error(error: ErrCodeError) -> HTTPException:
    """Convert ErrCodeError to HTTP exception"""
    # Map error codes to HTTP status codes
    status_map = {
        # 404 errors
        ErrCode.PROVIDER_NOT_FOUND: 404,
        ErrCode.AGENT_NOT_FOUND: 404,
        ErrCode.TOPIC_NOT_FOUND: 404,
        ErrCode.SESSION_NOT_FOUND: 404,
        ErrCode.GRAPH_AGENT_NOT_FOUND: 404,
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
    }

    status_code = status_map.get(error.code, 500)

    return HTTPException(
        status_code=status_code,
        detail=error.as_dict(),
    )
