import logging
from typing import Any, Dict, List, Optional

import requests
from fastmcp import FastMCP
from fastmcp.server.auth import JWTVerifier
from fastmcp.server.dependencies import AccessToken, get_access_token

from internal import configs
from middleware.auth import get_auth_provider

logger = logging.getLogger(__name__)

lab_mcp: FastMCP = FastMCP(name="Lab 🚀")

lab_auth = JWTVerifier(
    public_key="""-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnn3jPyW81YqSjSLWBkdE
ZzurZ5gimj6Db693bO0WvhMPABpYdOTeAU1mnQh2ep4H7zoUdz4PKARh/p5Meh6l
ejtbyliptvW9WXg5LoquIzPyTe5/2W9GoTrzDHMdM89Gc2dn16TbsKU5z3lROlBP
Q2v7UjQCbs8VpSogb44kOn0cx/MV2+VBfJzFWkJnaXxc101YUteJytJRMli0Wqev
nYqzCgrtbdvqVF/8hqETZOIWdWlhRDASdYw3R08rChcMJ9ucZL/VUM+aKu+feekQ
UZ6Bi6CeZjgqBoiwccApVR88WbyVXWR/3IFvJb0ndoSdH85klpp25yVAHTdSIDZP
lQIDAQAB
-----END PUBLIC KEY-----""",
    # NOTE: bohrium access token 中不携带 issuer 和 audience 字段，不注释则会校验失败报错
    # issuer="https://platform.test.bohrium.com",
    # audience="bb154829-8428-4fef-a110-b1066c752520",
    algorithm="RS256",
)

# CASE: 使用 Casdoor jwks 作为身份验证提供者
# lab_auth = JWTVerifier(
#     jwks_uri="http://localhost:8000/.well-known/jwks",
#     issuer="http://localhost:8000",
#     audience="4f2a3691f2168bc18b7f"
# )

# CASE: 使用对称加密算法 HS256，适用于测试环境
# lab_auth = JWTVerifier(
#     # 使用 RSA 公钥 (从 JWKS 的 x5c 证书中提取)
#     public_key="""-----BEGIN CERTIFICATE-----
# MIIE3TCCAsWgAwIBAgIDAeJAMA0GCSqGSIb3DQEBCwUAMCgxDjAMBgNVBAoTBWFkbWluMRYwFAYDVQQDEw1jZXJ0LWJ1aWx0LWluMB4XDTI0MDkwOTA5MjYxMVoXDTQ0MDkwOTA5MjYxMVowKDEOMAwGA1UEChMFYWRtaW4xFjAUBgNVBAMTDWNlcnQtYnVpbHQtaW4wggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQC3EnylZ2VurCm4gVtZHBUw67qvuKoYuU9whqaJr2UQEboIX4ca+FtZCjDgcBoD80lwSoYrcKpTG+DIVEMDznUHOjKwongRWclV1jeE3jZqObtmG9872yt/WX+nxQLyDrk+nUGhci6QrhgoYToN1DYaMqMV1Pi8catx8S0W3gg+ilb9mG3xdFpQo89o84mJhajTE/5/0jBuQ50Dx8CRolpRWjZ6i9RNVfFQglei+aW0RNf1PY6RqMkxc/Hy0XwXf/bjM5Ax7Aajwtehx0Q1zeUaRMMhFu6REtz345oJdLJpUkpFwJN4dPQ35a0tqnjkD1MLZjvBhSgOt5IPAJA1HmcR83RMBS8B3iV6y/clPjr02cjyasORy+kL/aFMfZfwvuRWX1NqRE99+rUTlPszH2SQi7PCUItQK72nnMYWBMXgyS8/Mra48q7LDAB/ZQnWuEG1+P1SdsQUWM2UaxkgjmfMNATVAgufrLOcOZDxAwVS7+quCF5f/QPTWaFqz5ofcpoUlf0iriv/k1mil7OghX0eqyLI2cCSma+dgB1eMni91eDCLVRT25mGDYreFjkpAwpMx2uaBk5e6ffT2jmZ2Zp9iCrUomLXDNiwY2wZDClcDKFiHNhNPAN3IbvBC3c6qpt0dLsWvGYW2IQTTnI71r/YY1XN/mTa4t/zwI+/kghjMQIDAQABoxAwDjAMBgNVHRMBAf8EAjAAMA0GCSqGSIb3DQEBCwUAA4ICAQBJUMBYJXnNihlGA2NMFIZMlsnW+5tjUqqK/Pv+oSptrqZxwDKFZL0NMxd4pVnLxIdU5HEcN2e01Xyqlaf5Tm3BZN6MaRVZAIRVfvxcNESQYA0jSFjsJzZUFGIQf8P9a5u+7qqSmj4tZx4XaRjOGSOf8t2RMJDmAbUeydLiD8nyCcxTzetmyYky8J3NBUoYGRbwU6KKbkxHbT35QheAb3jT4CELopLZ57Aa5Fb8xTjQ6tNqwZ+Z3993FkTOWPYLNLM1l46oN3g9yVY4ncGjUJkxsLTpAXB4I+wdqeew9XXexWNcY3cWWjA5VXgCNzntkPFM1D5IWkgP8MYVCvdv0Unfo78PahwVMoQMnDG4xLuS50gVKpukHLZQJNFPF0X4u/JeXauKPv/w7ssTTAK+8RIBYxBXQ72zDJNHyTqldR4efPHZfcW7OTmUr5FGNZThyW7ipvZRWcLM4u4IaWF2ncllOSqAXs1gDxkk201J7LrboZOjC3zgxE9HTCXpiszOAt5I38++5ufE3/hJW3ckz0jaJDeFqUphnn8eQhXPSwtCR8TL4ZpXSAFEpwahG+fCfZDK2KyPME33eXV3jtsYf0QHerYiMnP+tf1vAk3qtOzoE6Iv16fpBUvshk1Gm6E6bdhsP0hCrMwV4dm8uC3S52qcFiWZ6AC/HURaMbY+/lOs0A==
# -----END CERTIFICATE-----""",
#     issuer="http://localhost:8000",
#     audience="4f2a3691f2168bc18b7f",
#     algorithm="RS256",  # 使用 RSA 算法，匹配 JWKS 中的 alg
# )


@lab_mcp.tool
async def show_user_info() -> dict[str, Any]:
    """
    Returns the user information from the access token.
    """
    access_token: AccessToken | None = get_access_token()

    assert access_token is not None, "Access token is required for this operation."

    auth_provider = get_auth_provider()

    if not auth_provider:
        return {
            "message": "Authentication provider not configured.",
            "success": False,
        }

    # 使用现有的 parse_user_info 方法从 AccessToken 的 claims 中解析用户信息
    user_info = auth_provider.parse_user_info(access_token.claims)

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
