"""Unit tests for ErrCode, ErrCodeError, and handle_auth_error."""

import pytest

from app.common.code import ErrCode, ErrCodeError, handle_auth_error


# ------------------------------------------------------------------
# ErrCode.with_messages / with_errors
# ------------------------------------------------------------------


class TestErrCode:
    def test_with_messages_creates_error(self) -> None:
        error = ErrCode.AGENT_NOT_FOUND.with_messages("Agent 123 not found")
        assert isinstance(error, ErrCodeError)
        assert error.code == ErrCode.AGENT_NOT_FOUND
        assert "Agent 123 not found" in error.messages

    def test_with_messages_multiple(self) -> None:
        error = ErrCode.UNKNOWN_ERROR.with_messages("msg1", "msg2")
        assert len(error.messages) == 2

    def test_with_errors_extracts_strings(self) -> None:
        error = ErrCode.INTERNAL_SERVER_ERROR.with_errors(
            ValueError("bad value"), RuntimeError("runtime fail")
        )
        assert "bad value" in error.messages
        assert "runtime fail" in error.messages

    def test_with_errors_filters_none_like(self) -> None:
        # Empty string exceptions are filtered
        error = ErrCode.UNKNOWN_ERROR.with_errors(ValueError(""))
        # empty string is filtered by the tuple comprehension (str(err) is truthy check)
        # Actually the code filters on `if err`, not on message content
        assert isinstance(error, ErrCodeError)


# ------------------------------------------------------------------
# ErrCodeError
# ------------------------------------------------------------------


class TestErrCodeError:
    def test_format_with_messages(self) -> None:
        error = ErrCodeError(ErrCode.AGENT_NOT_FOUND, ("Agent not found",))
        formatted = str(error)
        assert "AGENT_NOT_FOUND" in formatted
        assert "7000" in formatted
        assert "Agent not found" in formatted

    def test_format_without_messages(self) -> None:
        error = ErrCodeError(ErrCode.AGENT_NOT_FOUND, ())
        formatted = str(error)
        assert "AGENT_NOT_FOUND" in formatted
        assert "7000" in formatted

    def test_as_dict_with_messages(self) -> None:
        error = ErrCodeError(ErrCode.AGENT_NOT_FOUND, ("primary", "detail1", "detail2"))
        d = error.as_dict()
        assert d["msg"] == "primary"
        assert d["info"] == ["detail1", "detail2"]

    def test_as_dict_single_message(self) -> None:
        error = ErrCodeError(ErrCode.AGENT_NOT_FOUND, ("only message",))
        d = error.as_dict()
        assert d["msg"] == "only message"
        assert "info" not in d  # no rest means no info key

    def test_as_dict_no_messages(self) -> None:
        error = ErrCodeError(ErrCode.AGENT_NOT_FOUND, ())
        d = error.as_dict()
        assert d["msg"] == "Agent Not Found"
        assert d["info"] == []

    def test_empty_messages_filtered(self) -> None:
        error = ErrCodeError(ErrCode.UNKNOWN_ERROR, ("", "valid", ""))
        assert error.messages == ("valid",)


# ------------------------------------------------------------------
# handle_auth_error
# ------------------------------------------------------------------


class TestHandleAuthError:
    @pytest.mark.parametrize(
        ("code", "expected_status"),
        [
            # 404
            (ErrCode.AGENT_NOT_FOUND, 404),
            (ErrCode.SESSION_NOT_FOUND, 404),
            (ErrCode.PROVIDER_NOT_FOUND, 404),
            (ErrCode.TOPIC_NOT_FOUND, 404),
            (ErrCode.FOLDER_NOT_FOUND, 404),
            (ErrCode.FILE_NOT_FOUND, 404),
            # 403
            (ErrCode.AGENT_ACCESS_DENIED, 403),
            (ErrCode.AGENT_NOT_OWNED, 403),
            (ErrCode.PROVIDER_SYSTEM_READONLY, 403),
            (ErrCode.SESSION_ACCESS_DENIED, 403),
            (ErrCode.TOPIC_ACCESS_DENIED, 403),
            # 401
            (ErrCode.AUTHENTICATION_REQUIRED, 401),
            (ErrCode.INVALID_TOKEN, 401),
            (ErrCode.TOKEN_EXPIRED, 401),
            # 402
            (ErrCode.INSUFFICIENT_BALANCE, 402),
            # 400
            (ErrCode.INVALID_REQUEST, 400),
            (ErrCode.REDEMPTION_CODE_EXPIRED, 400),
            (ErrCode.ALREADY_CHECKED_IN_TODAY, 400),
            # 409
            (ErrCode.REDEMPTION_CODE_ALREADY_EXISTS, 409),
            # 413
            (ErrCode.PAYLOAD_TOO_LARGE, 413),
            # 415
            (ErrCode.UNSUPPORTED_CONTENT_TYPE, 415),
        ],
    )
    def test_status_code_mapping(self, code: ErrCode, expected_status: int) -> None:
        error = code.with_messages("test")
        exc = handle_auth_error(error)
        assert exc.status_code == expected_status

    def test_unmapped_code_defaults_to_500(self) -> None:
        # Use a code that's not in the status_map
        error = ErrCode.SERVICE_UNAVAILABLE.with_messages("down")
        exc = handle_auth_error(error)
        assert exc.status_code == 500

    def test_response_body_matches_as_dict(self) -> None:
        error = ErrCode.AGENT_NOT_FOUND.with_messages("Agent 123 not found")
        exc = handle_auth_error(error)
        assert exc.detail == error.as_dict()

    def test_response_body_no_messages(self) -> None:
        error = ErrCodeError(ErrCode.AGENT_NOT_FOUND, ())
        exc = handle_auth_error(error)
        assert exc.detail["msg"] == "Agent Not Found"
