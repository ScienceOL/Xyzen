import logging

import requests
from fastmcp import FastMCP
from fastmcp.server.dependencies import AccessToken, get_access_token

from internal import configs

logger = logging.getLogger(__name__)

lab_mcp: FastMCP = FastMCP(name="Lab 🚀")


@lab_mcp.tool
async def show_user_info() -> dict[str, str]:
    """
    Returns the user information from the access token.
    """
    access_token: AccessToken | None = get_access_token()

    assert access_token is not None, "Access token is required for this operation."

    logger.info(f"Access token: {access_token}")
    user_id = access_token.client_id
    user_scopes = access_token.scopes
    logger.info(f"User ID: {user_id}, Scopes: {user_scopes}")

    return {
        "message": f"Hello, {user_id}! Your scopes are: {', '.join(user_scopes)}",
    }


@lab_mcp.tool
async def list_laboratory_devices() -> dict:
    """
    Lists laboratory devices by calling an internal lab API.
    Authentication is handled automatically on the server.

    Args:

    Returns:
        A dictionary containing the result of the operation.
        On success, the dictionary will contain the following keys:
        - `success` (bool): Always `True` if the operation was successful.
        - `lab_name` (str): The name of the laboratory.
        - `devices` (list[str]): A list of all device IDs within the lab.
        - `device_count` (int): The number of devices.

        If an error occurs, the dictionary will contain `error` (str) and `success` (bool, always `False`).
    """
    category = "device"  # Default to device category
    try:
        api_secret = configs.Lab.Key
        if not api_secret:
            raise ValueError("API SecretKey is not configured on the server.")

        url = f"{configs.Lab.Api}/api/environment/lab/mcp"
        params = {"secret_key": api_secret, "type": category}

        logger.info(f"Making request to {url}...")

        response = requests.get(url, params=params, timeout=configs.Lab.Timeout)
        response.raise_for_status()

        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        data = result.get("data", {})
        devices = data.get("devices", [])
        logger.info(f"Successfully retrieved {len(devices)} devices for lab: {data.get('lab_name')}")

        return {"success": True, "lab_name": data.get("lab_name"), "devices": devices, "device_count": len(devices)}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}


@lab_mcp.tool
async def list_laboratory_resources() -> dict:
    """
    Lists laboratory resources by calling an internal lab API.
    Authentication is handled automatically on the server.

    Args:

    Returns:
        A dictionary containing the result of the operation.
        On success, the dictionary will contain the following keys:
        - `success` (bool): Always `True` if the operation was successful.
        - `lab_name` (str): The name of the laboratory.
        - `devices` (list[str]): A list of all device IDs within the lab.
        - `device_count` (int): The number of devices.

        If an error occurs, the dictionary will contain `error` (str) and `success` (bool, always `False`).
    """
    category = "device"  # Default to device category
    try:
        api_secret = configs.Lab.Key
        if not api_secret:
            raise ValueError("API SecretKey is not configured on the server.")

        url = f"{configs.Lab.Api}/api/environment/lab/mcp"
        params = {"secret_key": api_secret, "type": None}

        logger.info(f"Making request to {url}...")

        response = requests.get(url, params=params, timeout=configs.Lab.Timeout)
        response.raise_for_status()

        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        data = result.get("data", {})
        devices = data.get("devices", [])
        logger.info(f"Successfully retrieved {len(devices)} devices for lab: {data.get('lab_name')}")

        return {"success": True, "lab_name": data.get("lab_name"), "devices": devices, "device_count": len(devices)}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}


@lab_mcp.tool
async def list_device_actions(device_id: str) -> dict:
    """
    Lists actions for a specific device by calling the internal lab API.

    Args:
        device_id: The ID of the device to list actions for

    Returns:
        Dictionary containing device ID and available actions, or an error.
    """
    try:
        api_secret = configs.Lab.Key
        if not api_secret:
            raise ValueError("API SecretKey is not configured on the server.")

        url = f"{configs.Lab.Api}/api/environment/lab/mcp/actions/"
        params = {"secret_key": api_secret, "device_id": device_id}

        logger.info(f"Making request to {url} for device {device_id}...")

        response = requests.get(url, params=params, timeout=configs.Lab.Timeout)
        response.raise_for_status()

        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        data = result.get("data", {})
        actions = data.get("actions", {})
        logger.info(f"Successfully retrieved {len(actions)} actions for device: {device_id}")

        return {"success": True, "device_id": data.get("device_id"), "actions": actions, "action_count": len(actions)}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}


@lab_mcp.tool
async def perform_device_action(device_id: str, action_type: str, action: str, params: dict) -> dict:
    """
    Performs a specific action on a device by calling the internal lab API.


    Args:
        device_id: The ID of the device to perform action on
        action_type: The action type (e.g., "unilabos_msgs.action._send_cmd.SendCmd")
        action: The action name (e.g., "command")
        command: The command to send (e.g., "start")

    Returns:
        Dictionary containing job ID and status, or an error.
    """
    try:
        api_secret = configs.Lab.Key
        if not api_secret:
            raise ValueError("API SecretKey is not configured on the server.")

        url = f"{configs.Lab.Api}/api/environment/lab/mcp/execute/"
        http_params = {"secret_key": api_secret, "device_id": device_id}

        payload = {
            "action_type": action_type,
            "action": action,
            "data": params,
        }

        logger.info(f"Making POST request to {url} for device {device_id} with action {action}...")

        response = requests.post(url, params=http_params, json=payload, timeout=configs.Lab.Timeout)
        response.raise_for_status()

        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        data = result.get("data", {})
        logger.info(f"Successfully executed action on device {device_id}, job_id: {data.get('job_id')}")

        return {"success": True, "job_id": data.get("job_id"), "status": data.get("status")}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}


@lab_mcp.tool
async def get_device_status(device_id: str) -> dict:
    """
    Gets the status of a specific device by calling the internal lab API.

    Args:
        device_id: The ID of the device to get status for

    Returns:
        Dictionary containing device ID and status information, or an error.
    """
    try:
        api_secret = configs.Lab.Key
        if not api_secret:
            raise ValueError("API SecretKey is not configured on the server.")

        url = f"{configs.Lab.Api}/api/environment/lab/mcp/device_status/"
        params = {"secret_key": api_secret, "device_id": device_id}

        logger.info(f"Making request to {url} for device {device_id}...")

        response = requests.get(url, params=params, timeout=configs.Lab.Timeout)
        response.raise_for_status()

        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        data = result.get("data", {})
        status = data.get("status", {})
        logger.info(f"Successfully retrieved status for device: {device_id}")

        return {"success": True, "device_id": data.get("device_id"), "statuses": status, "status_count": len(status)}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}
