import logging
from typing import Any, Dict, List, Optional

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


@lab_mcp.tool
def get_workflow_templates(
    by_user: Optional[bool] = None,
    tag_filters: Optional[List[str]] = None,
    page: Optional[int] = 1,
    page_size: Optional[int] = 10,
    timeout: int = 30,
) -> Dict[str, Any]:
    """
    获取工作流模板列表，支持分页和标签过滤

    Args:
        by_user: 是否按用户过滤
        tag_filters: 标签过滤列表，例如 ["机器学习", "数据处理"]
        page: 页码，默认为1
        page_size: 每页数量，默认为10，最大100
        timeout: 请求超时时间（秒），默认30

    Returns:
        包含工作流模板列表的响应数据
    """
    try:
        api_secret = configs.Lab.Key
        if not api_secret:
            raise ValueError("API SecretKey is not configured on the server.")

        # 构建查询参数
        params = {"secret_key": api_secret}
        if by_user:
            params["by_user"] = "true"
        if page:
            params["page"] = str(page)
        if page_size:
            params["page_size"] = str(page_size)

        # 构建完整URL
        url = f"{configs.Lab.Api}/api/flociety/vs/workflows/library/"

        logger.info(f"请求工作流模板列表: {url}, 参数: {params}")

        # 发送GET请求，对于tag_filters使用特殊处理
        if tag_filters:
            # 为每个标签添加参数
            tag_params = [(key, value) for key, value in params.items()]
            for tag in tag_filters:
                tag_params.append(("tag", tag))
            response = requests.get(url, params=tag_params, timeout=configs.Lab.Timeout)
        else:
            response = requests.get(url, params=params, timeout=configs.Lab.Timeout)
        response.raise_for_status()

        result = response.json()

        if "code" in result and result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        return {"success": True, **result}

    except requests.exceptions.Timeout:
        logger.error("请求超时")
        return {"code": -1, "msg": "请求超时", "data": {"count": 0, "next": None, "previous": None, "results": []}}
    except requests.exceptions.ConnectionError:
        logger.error("连接错误")
        return {
            "code": -1,
            "msg": "无法连接到服务器",
            "data": {"count": 0, "next": None, "previous": None, "results": []},
        }
    except requests.exceptions.RequestException as e:
        logger.error(f"请求异常: {str(e)}")
        return {
            "code": -1,
            "msg": f"请求失败: {str(e)}",
            "data": {"count": 0, "next": None, "previous": None, "results": []},
        }
    except Exception as e:
        logger.error(f"获取工作流模板列表失败: {str(e)}")
        return {
            "code": -1,
            "msg": f"获取工作流模板列表失败: {str(e)}",
            "data": {"count": 0, "next": None, "previous": None, "results": []},
        }


@lab_mcp.tool
def get_workflow_template_tags(timeout: int = 30) -> Dict[str, Any]:
    """
    获取所有工作流模板的标签列表

    Args:
        timeout: 请求超时时间（秒），默认30

    Returns:
        包含所有可用标签的响应数据
    """
    try:
        api_secret = configs.Lab.Key
        if not api_secret:
            raise ValueError("API SecretKey is not configured on the server.")

        # 构建完整URL
        url = f"{configs.Lab.Api}/api/flociety/vs/workflows/library/tags/"
        params = {"secret_key": api_secret}

        logger.info(f"请求工作流模板标签: {url}")

        # 发送GET请求
        response = requests.get(url, params=params, timeout=configs.Lab.Timeout)
        response.raise_for_status()

        result = response.json()

        # if result.get("code") != 200:
        #     error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
        #     logger.error(error_msg)
        #     return {"error": error_msg, "success": False}

        return {"success": True, "tags": result.get("tags")}

    except Exception as e:
        logger.error(f"获取工作流模板标签失败: {str(e)}")
        return {"code": -1, "msg": f"获取工作流模板标签失败: {str(e)}", "tags": []}


@lab_mcp.tool
def create_workflow_template(
    workflow_uuid: str, title: str, description: str, labels: Optional[List[str]] = None, timeout: int = 30
) -> Dict[str, Any]:
    """
    创建工作流模板

    Args:
        workflow_uuid: 工作流UUID
        title: 模板标题
        description: 模板描述
        labels: 标签列表，可选
        timeout: 请求超时时间（秒），默认30

    Returns:
        创建结果
    """
    try:
        api_secret = configs.Lab.Key
        if not api_secret:
            raise ValueError("API SecretKey is not configured on the server.")

        # 构建完整URL
        url = f"{configs.Lab.Api}/api/flociety/vs/workflows/library/"
        params = {"secret_key": api_secret}

        # 构建请求数据
        data = {"workflow_uuid": workflow_uuid, "title": title, "description": description, "labels": labels or []}

        logger.info(f"创建工作流模板: {url}, 数据: {data}")

        # 发送POST请求
        response = requests.post(url, params=params, json=data, timeout=configs.Lab.Timeout)
        response.raise_for_status()

        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        return {"code": 0, "msg": "工作流模板创建成功", "data": result.get("data")}

    except Exception as e:
        logger.error(f"创建工作流模板失败: {str(e)}")
        return {"code": -1, "msg": f"创建工作流模板失败: {str(e)}", "data": None}


@lab_mcp.tool
def run_workflow(workflow_uuid: str, timeout: int = 30) -> Dict[str, Any]:
    """
    运行指定的工作流

    Args:
        workflow_uuid: 工作流UUID
        timeout: 请求超时时间（秒），默认30

    Returns:
        运行结果
    """
    try:
        api_secret = configs.Lab.Key
        if not api_secret:
            raise ValueError("API SecretKey is not configured on the server.")

        # 构建完整URL
        url = f"{configs.Lab.Api}/api/v1/run-workflow/"
        url = f"{configs.Lab.Api}/api/v1/run_workflow/"
        params = {"secret_key": api_secret}

        # 构建请求数据
        data = {"uuid": workflow_uuid}

        logger.info(f"运行工作流: {url}, 数据: {data}")

        # 发送POST请求
        response = requests.post(url, params=params, json=data, timeout=configs.Lab.Timeout)
        response.raise_for_status()

        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        return {"code": 0, "msg": "工作流运行成功", "data": result.get("data")}

    except Exception as e:
        logger.error(f"运行工作流失败: {str(e)}")
        return {"code": -1, "msg": f"运行工作流失败: {str(e)}", "data": None}


@lab_mcp.tool
def fork_workflow_template(
    workflow_template_uuid: str, lab_uuid: str = "default", timeout: int = 30
) -> Dict[str, Any]:
    """
    Fork（复制）工作流模板到指定的实验室环境。当前你不需要获得实验室的 UUID，因为它会自动使用配置中的实验室UUID。

    Args:
        workflow_template_uuid: 源工作流模板的UUID
        lab_uuid: 目标实验室的UUID，默认为"default"，默认值时将使用默认实验室
        timeout: 请求超时时间（秒），默认30

    Returns:
        Fork结果，包含新创建的工作流UUID或错误信息
    """
    try:
        api_secret = configs.Lab.Key
        if not api_secret:
            raise ValueError("API SecretKey is not configured on the server.")

        # 构建完整URL
        url = f"{configs.Lab.Api}/api/flociety/workflow/{workflow_template_uuid}/fork/"
        params = {"secret_key": api_secret}

        # 使用配置中的实验室UUID
        if lab_uuid == "default":
            lab_uuid = configs.Lab.UUID
        # 构建请求数据
        data = {"lab_uuid": lab_uuid}

        logger.info(f"Fork工作流模板: {url}, 数据: {data}")

        # 发送POST请求
        response = requests.post(url, params=params, json=data, timeout=configs.Lab.Timeout)
        response.raise_for_status()

        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        return {"code": 0, "msg": "工作流模板Fork成功", "data": result.get("data")}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}
    except Exception as e:
        logger.error(f"Fork工作流模板失败: {str(e)}")
        return {"code": -1, "msg": f"Fork工作流模板失败: {str(e)}", "data": None}


# @lab_mcp.tool
# def get_user_laboratories(timeout: int = 30) -> Dict[str, Any]:
#     """
#     获取用户可访问的实验室列表（用于Fork操作时选择目标实验室）

#     Args:
#         timeout: 请求超时时间（秒），默认30

#     Returns:
#         用户实验室列表
#     """
#     try:
#         api_secret = configs.Lab.Key
#         if not api_secret:
#             raise ValueError("API SecretKey is not configured on the server.")

#         # 构建完整URL
#         url = f"{configs.Lab.Api}/api/environment/labs/"
#         params = {"secret_key": api_secret}

#         logger.info(f"获取用户实验室列表: {url}")

#         # 发送GET请求
#         response = requests.get(url, params=params, timeout=configs.Lab.Timeout)
#         response.raise_for_status()

#         result = response.json()

#         if result.get("code") != 0:
#             error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
#             logger.error(error_msg)
#             return {"error": error_msg, "success": False}

#         return {"code": 0, "msg": "获取实验室列表成功", "data": result.get("data")}

#     except requests.exceptions.RequestException as e:
#         error_msg = f"Network error when calling lab API: {str(e)}"
#         logger.error(error_msg)
#         return {"error": error_msg, "success": False}
#     except Exception as e:
#         logger.error(f"获取用户实验室列表失败: {str(e)}")
#         return {"code": -1, "msg": f"获取用户实验室列表失败: {str(e)}", "data": []}


@lab_mcp.tool
def workflow_template_examples() -> Dict[str, Any]:
    """
    获取工作流模板API的使用示例

    Returns:
        包含使用示例的说明
    """
    examples = {
        "获取所有模板": {"function": "get_workflow_templates", "example": {"page": 1, "page_size": 10}},
        "按标签过滤": {
            "function": "get_workflow_templates",
            "example": {"tag_filters": ["机器学习", "数据处理"], "page": 1, "page_size": 20},
        },
        "按用户过滤": {"function": "get_workflow_templates", "example": {"by_user": True, "page": 1, "page_size": 10}},
        "获取标签列表": {"function": "get_workflow_template_tags", "example": {}},
        "创建模板": {
            "function": "create_workflow_template",
            "example": {
                "workflow_uuid": "550e8400-e29b-41d4-a716-446655440000",
                "title": "我的工作流模板",
                "description": "这是一个示例工作流模板",
                "labels": ["机器学习", "数据处理"],
            },
        },
        "运行工作流": {
            "function": "run_workflow",
            "example": {"workflow_uuid": "550e8400-e29b-41d4-a716-446655440000"},
        },
        "Fork工作流模板": {
            "function": "fork_workflow_template",
            "example": {
                "workflow_template_uuid": "550e8400-e29b-41d4-a716-446655440000",
            },
            "description": "将工作流模板复制到默认实验室，会自动处理节点模板的实验室映射",
        },
    }

    return {"code": 0, "msg": "工作流模板API使用示例", "data": examples}
