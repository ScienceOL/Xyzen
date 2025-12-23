import json
import logging
from typing import Any, Iterable, Mapping, Optional, Union

import requests
from fastmcp import FastMCP
from fastmcp.server.auth import JWTVerifier, TokenVerifier
from fastmcp.server.dependencies import get_access_token

from app.common.configs import configs
from app.middleware.auth import AuthProvider
from app.middleware.auth.token_verifier.bohr_app_token_verifier import BohrAppTokenVerifier

logger = logging.getLogger(__name__)

osdl_mcp: FastMCP = FastMCP(name="Open SDL MCP", version="1.0.0")

# 认证配置
auth: TokenVerifier

match AuthProvider.get_provider_name():
    case "bohrium":
        auth = JWTVerifier(
            public_key=AuthProvider.public_key,
        )
    case "casdoor":
        auth = JWTVerifier(
            jwks_uri=AuthProvider.jwks_uri,
        )
    case "bohr_app":
        auth = BohrAppTokenVerifier(
            api_url=AuthProvider.issuer,
            x_app_key="xyzen-uuid1760783737",
        )
    case _:
        raise ValueError(f"Unsupported authentication provider: {AuthProvider.get_provider_name()}")

ParamsType = Mapping[str, Union[str, int, float, None, Iterable[Union[str, int, float]]]]


def get_lab_api_url(path: str) -> str:
    """
    Construct the full URL for the Lab API.

    Since this is a backend service, we cannot use relative paths or infer the
    external hostname easily. We rely on configs.Lab.Api to point to the correct
    internal or external service address.
    """
    # base = getattr(configs.Lab, "Api", "")
    base = "http://host.docker.internal:48197"
    if not base:
        raise ValueError("configs.Lab.Api is not configured.")
    return f"{base.rstrip('/')}{path}"


# 执行设备动作
@osdl_mcp.tool
async def run_action(
    lab_uuid: str,
    device_id: str,
    action_type: str,
    action: str,
    param: Optional[Any] = None,
) -> dict:
    """
    Execute a device action in the laboratory.

    Args:
        lab_uuid (str): The UUID of the laboratory.
        device_id (str): The ID (or name) of the device to operate on.
        action_type (str): The type of action (e.g., "read", "write", "control").
        action (str): The specific action name to execute.
        param (Optional[Any]): Parameters for the action. Can be a dict or a JSON string.

    Returns:
        dict: Result containing success status and task information.
    """
    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        url = get_lab_api_url("/api/v1/lab/action/run")
        headers = {
            "Authorization": f"Bearer {access_token.token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        # --- normalize param into a dict (JSON object) ---
        if param is None:
            apiparams = {"unilabos_device_id": device_id}
        elif isinstance(param, dict):
            apiparams = param
        elif isinstance(param, str):
            # try parse JSON string -> dict
            try:
                parsed = json.loads(param)
                if isinstance(parsed, dict):
                    apiparams = parsed
                else:
                    # parsed is not a dict (e.g. list/number), wrap as device id fallback
                    apiparams = {"unilabos_device_id": param}
            except json.JSONDecodeError:
                # not a JSON string, treat as device id
                apiparams = {"unilabos_device_id": param}
        else:
            # other types (list/tuple/etc) — try to coerce to dict safely
            try:
                apiparams = dict(param)
            except Exception:
                return {
                    "error": "param must be a JSON object/dict (or JSON string representing one)",
                    "success": False,
                }

        payload = {
            "lab_uuid": lab_uuid,
            "device_id": device_id,
            "action_type": action_type,
            "action": action,
            "param": apiparams,
        }

        logger.info(f"Making POST request to {url} with payload: {payload}")

        response = requests.post(url, headers=headers, json=payload, timeout=configs.Lab.Timeout)
        response.raise_for_status()
        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        data = result.get("data", {})
        return {"success": True, "data": data}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}


# 查询动作执行结果
@osdl_mcp.tool
async def get_action_result(task_uuid: str) -> dict:
    """
    Check the status and result of a device action job.

    Args:
        task_uuid (str): The UUID of the task/job to check.

    Returns:
        dict: Result containing the job status and output if finished.
    """
    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        url = get_lab_api_url(f"/api/v1/lab/action/result/{task_uuid}")
        headers = {
            "Authorization": f"Bearer {access_token.token}",
            "Accept": "application/json",
        }

        logger.info(f"Making GET request to {url}")

        response = requests.get(url, headers=headers, timeout=configs.Lab.Timeout)
        response.raise_for_status()
        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        data = result.get("data", {})
        return {"success": True, "data": data}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}


# 获取当前用户信息
@osdl_mcp.tool
async def show_user_info() -> dict[str, Any]:
    """
    Returns the user information from the access token.
    """
    access_token = get_access_token()
    if not access_token:
        return {"error": "Access token is required for this operation."}

    # 使用现有的 parse_user_info 方法从 AccessToken 的 claims 中解析用户信息
    user_info = AuthProvider.parse_user_info(access_token.claims)

    if not user_info or not user_info.id:
        return {
            "message": f"Hello, unknown! Your scopes are: {', '.join(access_token.scopes)}",
        }

    return {
        "id": user_info.id,
        "username": user_info.username,
        "email": user_info.email,
        "displayName": user_info.display_name,
        "avatarUrl": user_info.avatar_url,
        "extra": user_info.extra,
    }


# 获取实验室列表
@osdl_mcp.tool
async def list_laboratories() -> dict:
    """
    Retrieve a list of laboratories.

    Returns:
        dict: Operation result containing the list of laboratories.
    """
    try:
        url = get_lab_api_url("/api/v1/lab/list?page=1&page_size=1000")
        access_token = get_access_token()
        if not access_token:
            raise ValueError("Access token is required for this operation.")

        resp = requests.get(
            url,
            headers={"Authorization": f"Bearer {access_token.token}"},
            timeout=configs.Lab.Timeout,
        )

        resp.raise_for_status()
        result = resp.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        labs = result.get("data", {}).get("data", [])
        return {"success": True, "labs": labs}
    except Exception as e:
        error_msg = f"Error fetching laboratories: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}


# 获取实验室下所有设备/物料
@osdl_mcp.tool
async def list_materials(lab_uuid: str, type: str = "resources") -> dict:
    """
    Retrieve all materials (devices/resources) in a laboratory.

    Args:
        lab_uuid (str): Unique identifier of the laboratory.
        type (str, optional): Type of resources to list, default is "resources".

    Returns:
        dict: Operation result containing the list of materials.
    """
    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        url = get_lab_api_url("/api/v1/lab/material/resource")
        headers = {
            "Authorization": f"Bearer {access_token.token}",
            "Accept": "application/json",
        }
        params = {"lab_uuid": lab_uuid, "type": type}

        response = requests.get(url, headers=headers, params=params, timeout=configs.Lab.Timeout)
        response.raise_for_status()
        result = response.json()

        if result.get("code") != 0:
            return {"error": result.get("msg", "Unknown Error"), "success": False}

        data = result.get("data", {})
        # The API returns 'resource_name_list' which contains objects with 'name', 'uuid', etc.
        materials = data.get("resource_name_list", [])

        return {"success": True, "materials": materials, "count": len(materials)}

    except Exception as e:
        return {"error": str(e), "success": False}


# 获取设备可用动作
async def _list_material_actions(lab_uuid: str, material_name: str) -> dict:
    """
    Internal helper to retrieve available actions for a specific material/device.
    """
    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        url = get_lab_api_url("/api/v1/lab/material/device/actions")
        headers = {
            "Authorization": f"Bearer {access_token.token}",
            "Accept": "application/json",
        }
        params = {"name": material_name, "lab_uuid": lab_uuid}

        response = requests.get(url, headers=headers, params=params, timeout=configs.Lab.Timeout)
        response.raise_for_status()
        result = response.json()

        if result.get("code") != 0:
            return {"error": result.get("msg", "Unknown Error"), "success": False}

        data = result.get("data", {})
        actions = data.get("actions", [])

        return {
            "success": True,
            "material_name": data.get("name", material_name),
            "actions": actions,
            "count": len(actions),
        }

    except Exception as e:
        return {"error": str(e), "success": False}


@osdl_mcp.tool
async def list_material_actions(lab_uuid: str, material_name: str) -> dict:
    """
    Retrieve available actions for a specific material/device.

    Args:
        lab_uuid (str): Unique identifier of the laboratory.
        material_name (str): Name of the material/device.

    Returns:
        dict: Operation result containing the list of actions.
    """
    return await _list_material_actions(lab_uuid, material_name)


# 获取动作参数详情
@osdl_mcp.tool
async def get_action_params(lab_uuid: str, material_name: str, action_name: str) -> dict:
    """
    Get the required parameters for a specific action.
    Use this to confirm with the user before executing an action.

    Args:
        lab_uuid (str): Unique identifier of the laboratory.
        material_name (str): Name of the material/device.
        action_name (str): Name of the action.

    Returns:
        dict: Operation result containing the action details and parameters.
    """
    # Reuse list_material_actions logic
    result = await _list_material_actions(lab_uuid, material_name)
    if not result.get("success"):
        return result

    actions = result.get("actions", [])
    for action in actions:
        if action.get("name") == action_name:
            return {
                "success": True,
                "action": action,
                "params": action.get("args", []),  # Assuming 'args' contains params info based on typical schema
            }

    return {"error": f"Action '{action_name}' not found for material '{material_name}'", "success": False}


@osdl_mcp.prompt("Laboratory Control Assistant")
def lab_control_prompt() -> str:
    """
    Returns the system prompt for the Laboratory Control Assistant.
    """
    return """You are a Laboratory Control Assistant. Your goal is to help users manage and control laboratory equipment via the OpenSDL interface.

Follow these steps when asked to perform an action:
1.  **Identify the Laboratory**: If the user hasn't specified a lab, use `list_laboratories` to show available labs and ask them to select one.
2.  **Identify the Material/Device**: If the user hasn't specified a device, use `list_materials` to list available devices in the selected lab.
3.  **Identify the Action**: If the user wants to perform an action but hasn't specified which one, use `list_material_actions` to show available actions for the device.
4.  **Confirm Parameters**: Before executing an action, especially if it requires parameters, use `get_action_params` to retrieve the required parameters. Present these to the user and ask for confirmation or values if missing.
5.  **Execute**: Once confirmed, use `run_action` to execute the command.
6.  **Monitor**: After execution, the system will return a `job_id` or `task_uuid`. Inform the user that the task has started. You should then offer to check the status or automatically check it after a short delay using `get_action_result`.

Always be safety-conscious. If an action looks dangerous or irreversible, double-check with the user.
"""
