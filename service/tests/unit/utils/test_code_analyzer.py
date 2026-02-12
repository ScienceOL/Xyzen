"""Unit tests for app/utils/code_analyzer.py — AST-based code analysis."""

import json

import pytest

from app.utils.code_analyzer import (
    convert_to_schema,
    discover_functions_from_code,
    generate_basic_schema,
)


# ------------------------------------------------------------------
# discover_functions_from_code
# ------------------------------------------------------------------


class TestDiscoverFunctionsFromCode:
    def test_single_public_function(self) -> None:
        code = 'def hello(name: str) -> str:\n    """Say hello."""\n    return f"Hi {name}"'
        funcs = discover_functions_from_code(code)
        assert len(funcs) == 1
        assert funcs[0]["name"] == "hello"
        assert funcs[0]["docstring"] == "Say hello."
        assert funcs[0]["return_annotation"] == "str"
        assert len(funcs[0]["args"]) == 1
        assert funcs[0]["args"][0]["name"] == "name"
        assert funcs[0]["args"][0]["annotation"] == "str"

    def test_private_function_excluded(self) -> None:
        code = "def _private(): pass\ndef public(): pass"
        funcs = discover_functions_from_code(code)
        assert len(funcs) == 1
        assert funcs[0]["name"] == "public"

    def test_multiple_functions_in_order(self) -> None:
        code = "def alpha(): pass\ndef beta(): pass\ndef gamma(): pass"
        funcs = discover_functions_from_code(code)
        names = [f["name"] for f in funcs]
        assert names == ["alpha", "beta", "gamma"]

    def test_function_without_annotations(self) -> None:
        code = "def bare(x, y): pass"
        funcs = discover_functions_from_code(code)
        assert len(funcs) == 1
        assert funcs[0]["args"][0]["annotation"] is None
        assert funcs[0]["args"][1]["annotation"] is None
        assert funcs[0]["return_annotation"] is None

    def test_docstring_fallback(self) -> None:
        code = "def no_doc(): pass"
        funcs = discover_functions_from_code(code)
        assert funcs[0]["docstring"] == "Function no_doc"

    def test_duplicate_names_keeps_last(self) -> None:
        code = (
            'def dup() -> int:\n    """First."""\n    return 1\n\n'
            'def dup() -> str:\n    """Second."""\n    return "2"'
        )
        funcs = discover_functions_from_code(code)
        assert len(funcs) == 1
        assert funcs[0]["docstring"] == "Second."
        assert funcs[0]["return_annotation"] == "str"

    def test_syntax_error_raises_value_error(self) -> None:
        with pytest.raises(ValueError, match="Invalid Python syntax"):
            discover_functions_from_code("def broken(:")

    def test_empty_code(self) -> None:
        assert discover_functions_from_code("") == []

    def test_no_functions(self) -> None:
        code = "x = 1\ny = 2\nclass Foo: pass"
        assert discover_functions_from_code(code) == []

    def test_line_number_captured(self) -> None:
        code = "# comment\n\ndef my_func(): pass"
        funcs = discover_functions_from_code(code)
        assert funcs[0]["line_number"] == 3


# ------------------------------------------------------------------
# convert_to_schema
# ------------------------------------------------------------------


class TestConvertToSchema:
    @pytest.mark.parametrize(
        ("type_str", "expected"),
        [
            ("str", {"type": "string"}),
            ("int", {"type": "integer"}),
            ("float", {"type": "number"}),
            ("bool", {"type": "boolean"}),
            ("list", {"type": "array"}),
            ("dict", {"type": "object"}),
            ("CustomClass", {"type": "string"}),
        ],
    )
    def test_type_mapping(self, type_str: str, expected: dict) -> None:
        assert convert_to_schema(type_str) == expected

    def test_generic_list_matched_by_substring(self) -> None:
        """List[int] contains 'int' so it matches integer before array.
        This documents the current behavior of the order-sensitive if/elif chain."""
        # "int" appears in "List[int]" and is checked before "List"
        assert convert_to_schema("List[int]") == {"type": "integer"}

    def test_generic_dict_with_str_matched_by_substring(self) -> None:
        """Dict[str, int] contains 'str' so it matches string before object."""
        assert convert_to_schema("Dict[str, int]") == {"type": "string"}

    def test_list_without_generic_param(self) -> None:
        """Plain 'List' should match array."""
        assert convert_to_schema("List") == {"type": "array"}

    def test_dict_without_generic_param(self) -> None:
        """Plain 'Dict' should match object."""
        assert convert_to_schema("Dict") == {"type": "object"}


# ------------------------------------------------------------------
# generate_basic_schema
# ------------------------------------------------------------------


class TestGenerateBasicSchema:
    def test_schema_with_typed_args(self) -> None:
        func_info = {
            "name": "add",
            "args": [
                {"name": "a", "annotation": "int"},
                {"name": "b", "annotation": "int"},
            ],
            "return_annotation": "int",
        }
        result = generate_basic_schema(func_info)

        assert "input_schema" in result
        assert "output_schema" in result

        input_schema = json.loads(result["input_schema"])
        assert input_schema["type"] == "object"
        assert "a" in input_schema["properties"]
        assert input_schema["properties"]["a"] == {"type": "integer"}
        assert input_schema["required"] == ["a", "b"]

        output_schema = json.loads(result["output_schema"])
        assert output_schema["properties"]["result"] == {"type": "integer"}

    def test_no_return_annotation_defaults_to_string(self) -> None:
        func_info = {
            "name": "greet",
            "args": [{"name": "name", "annotation": "str"}],
            "return_annotation": None,
        }
        result = generate_basic_schema(func_info)
        output_schema = json.loads(result["output_schema"])
        assert output_schema["properties"]["result"] == {"type": "string"}

    def test_no_args_produces_empty_properties(self) -> None:
        func_info = {
            "name": "noop",
            "args": [],
            "return_annotation": "str",
        }
        result = generate_basic_schema(func_info)
        input_schema = json.loads(result["input_schema"])
        assert input_schema["properties"] == {}
        assert input_schema["required"] == []

    def test_output_is_valid_json_strings(self) -> None:
        func_info = {
            "name": "f",
            "args": [{"name": "x", "annotation": "float"}],
            "return_annotation": "bool",
        }
        result = generate_basic_schema(func_info)
        # Both should be valid JSON strings
        json.loads(result["input_schema"])
        json.loads(result["output_schema"])
