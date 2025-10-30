import ast
import json
from typing import Any


def discover_functions_from_code(code_content: str) -> list[dict[str, Any]]:
    """
    Discover all callable functions in Python code using AST parsing.
    Always keeps only the last occurrence of each function name to handle duplicates.

    Args:
        code_content: Python code to analyze

    Returns:
        List of function metadata dictionaries with duplicates removed (keeping last occurrence)
    """
    try:
        tree = ast.parse(code_content)
        functions: list[dict[str, Any]] = []

        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                if not node.name.startswith("_"):  # Skip private functions
                    # Extract function signature info
                    args = []
                    for arg in node.args.args:
                        args.append(
                            {
                                "name": arg.arg,
                                "annotation": ast.unparse(arg.annotation) if arg.annotation else None,
                            }
                        )

                    functions.append(
                        {
                            "name": node.name,
                            "docstring": ast.get_docstring(node) or f"Function {node.name}",
                            "args": args,
                            "line_number": node.lineno,
                            "return_annotation": ast.unparse(node.returns) if node.returns else None,
                        }
                    )

        # Always filter to keep only the last occurrence of each function name
        seen_names = set()
        filtered_functions: list[dict[str, Any]] = []

        # Process in reverse order to keep the last occurrence of each function
        for func in reversed(functions):
            if func["name"] not in seen_names:
                filtered_functions.append(func)
                seen_names.add(func["name"])

        # Reverse back to maintain original order
        functions = list(reversed(filtered_functions))

        return functions
    except SyntaxError as e:
        raise ValueError(f"Invalid Python syntax: {e}")
    except Exception as e:
        raise ValueError(f"Error analyzing code: {e}")


def convert_to_schema(arg_type: str) -> dict[str, Any]:
    """
    Convert a Python type string to a Pydantic type string.
    """
    if arg_type == "str" or "str" in str(arg_type):
        return {"type": "string"}
    elif arg_type == "int" or "int" in str(arg_type):
        return {"type": "integer"}
    elif arg_type == "float" or "float" in str(arg_type):
        return {"type": "number"}
    elif arg_type == "bool" or "bool" in str(arg_type):
        return {"type": "boolean"}
    elif arg_type == "list" or "List" in str(arg_type):
        return {"type": "array"}
    elif arg_type == "dict" or "Dict" in str(arg_type):
        return {"type": "object"}
    else:
        return {"type": "string"}


def generate_basic_schema(function_info: dict[str, Any]) -> dict[str, str]:
    """
    Generate basic JSON schemas for a function.

    Args:
        function_info: Function metadata from discover_functions_from_code

    Returns:
        Dictionary with 'input_schema' and 'output_schema' keys
    """
    # Generate input schema
    properties = {}
    required = []

    for arg in function_info["args"]:
        arg_name = arg["name"]
        arg_type = arg.get("annotation", "Any")

        properties[arg_name] = convert_to_schema(arg_type)

        required.append(arg_name)

    input_schema = {"type": "object", "properties": properties, "required": required}

    # Generate output schema - wrap primitive types in object structure for MCP protocol
    return_type = function_info.get("return_annotation", "Any")
    result_type = convert_to_schema(return_type)

    # Wrap the result type in an object structure for MCP protocol compatibility
    output_schema = {
        "type": "object",
        "properties": {"result": result_type},
        "required": ["result"],
    }

    return {
        "input_schema": json.dumps(input_schema),
        "output_schema": json.dumps(output_schema),
    }
