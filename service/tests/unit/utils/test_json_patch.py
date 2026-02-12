"""Unit tests for app/utils/json_patch.py — pydantic-aware JSON serialization."""

import json

import pytest
from pydantic import BaseModel

from app.utils.json_patch import (
    _original_json_dumps,
    apply_json_patch,
    pydantic_aware_json_dumps,
    remove_json_patch,
)


@pytest.fixture(autouse=True)
def _restore_json_dumps():
    """Ensure json.dumps is always restored after each test."""
    yield
    remove_json_patch()


# ------------------------------------------------------------------
# pydantic_aware_json_dumps
# ------------------------------------------------------------------


class TestPydanticAwareJsonDumps:
    def test_plain_dict_passthrough(self) -> None:
        data = {"key": "value", "num": 42}
        assert pydantic_aware_json_dumps(data) == _original_json_dumps(data)

    def test_plain_list_passthrough(self) -> None:
        data = [1, "two", 3.0]
        assert pydantic_aware_json_dumps(data) == _original_json_dumps(data)

    def test_anyurl_like_object_serialized_to_string(self) -> None:
        """Objects whose type name contains 'AnyUrl' should be converted to str()."""

        class FakeAnyUrl:
            def __str__(self) -> str:
                return "https://example.com"

        # The type check looks for "AnyUrl" in str(type(o)), so rename the class
        FakeAnyUrl.__name__ = "AnyUrl"
        FakeAnyUrl.__qualname__ = "AnyUrl"
        url = FakeAnyUrl()

        result = json.loads(pydantic_aware_json_dumps({"url": url}))
        assert result["url"] == "https://example.com"

    def test_pydantic_model_serialized_via_model_dump(self) -> None:
        class MyModel(BaseModel):
            name: str
            value: int

        obj = MyModel(name="test", value=42)
        result = json.loads(pydantic_aware_json_dumps({"model": obj}))
        assert result["model"] == {"name": "test", "value": 42}

    def test_model_dump_failure_falls_back_to_str(self) -> None:
        class BadModel:
            def model_dump(self):
                raise RuntimeError("broken")

            def __str__(self) -> str:
                return "fallback-string"

        obj = BadModel()
        result = json.loads(pydantic_aware_json_dumps({"obj": obj}))
        assert result["obj"] == "fallback-string"

    def test_custom_default_function_called(self) -> None:
        """If a custom default= kwarg is passed, it should be tried."""

        class Custom:
            pass

        def custom_default(o):
            if isinstance(o, Custom):
                return "custom-handled"
            raise TypeError

        result = json.loads(pydantic_aware_json_dumps({"c": Custom()}, default=custom_default))
        assert result["c"] == "custom-handled"

    def test_custom_default_type_error_falls_back_to_str(self) -> None:
        class Unhandled:
            def __str__(self) -> str:
                return "str-fallback"

        def bad_default(o):
            raise TypeError("can't handle")

        result = json.loads(pydantic_aware_json_dumps({"x": Unhandled()}, default=bad_default))
        assert result["x"] == "str-fallback"

    def test_kwargs_forwarded(self) -> None:
        """Verify that standard json.dumps kwargs like indent are forwarded."""
        result = pydantic_aware_json_dumps({"a": 1}, indent=2)
        assert "\n" in result  # indented output has newlines


# ------------------------------------------------------------------
# apply / remove lifecycle
# ------------------------------------------------------------------


class TestJsonPatchLifecycle:
    def test_apply_replaces_json_dumps(self) -> None:
        apply_json_patch()
        assert json.dumps is pydantic_aware_json_dumps

    def test_remove_restores_original(self) -> None:
        apply_json_patch()
        remove_json_patch()
        assert json.dumps is _original_json_dumps

    def test_patched_dumps_handles_pydantic(self) -> None:
        """After patching, regular json.dumps should handle pydantic models."""

        class Simple(BaseModel):
            x: int

        apply_json_patch()
        result = json.loads(json.dumps({"m": Simple(x=7)}))
        assert result["m"] == {"x": 7}
