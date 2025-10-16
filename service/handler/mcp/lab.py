import json
import logging
from typing import Any, Dict, Iterable, List, Mapping, Optional, Union

import requests
from fastmcp import FastMCP
from fastmcp.server.auth import JWTVerifier
from fastmcp.server.dependencies import AccessToken, get_access_token

from internal import configs
from middleware.auth import AuthProvider

logger = logging.getLogger(__name__)

lab_mcp: FastMCP = FastMCP(name="Lab 🚀")

# lab_auth = JWTVerifier(
#     public_key="""-----BEGIN PUBLIC KEY-----
# MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnn3jPyW81YqSjSLWBkdE
# ZzurZ5gimj6Db693bO0WvhMPABpYdOTeAU1mnQh2ep4H7zoUdz4PKARh/p5Meh6l
# ejtbyliptvW9WXg5LoquIzPyTe5/2W9GoTrzDHMdM89Gc2dn16TbsKU5z3lROlBP
# Q2v7UjQCbs8VpSogb44kOn0cx/MV2+VBfJzFWkJnaXxc101YUteJytJRMli0Wqev
# nYqzCgrtbdvqVF/8hqETZOIWdWlhRDASdYw3R08rChcMJ9ucZL/VUM+aKu+feekQ
# UZ6Bi6CeZjgqBoiwccApVR88WbyVXWR/3IFvJb0ndoSdH85klpp25yVAHTdSIDZP
# lQIDAQAB
# -----END PUBLIC KEY-----""",
#     # NOTE: bohrium access token 中不携带 issuer 和 audience 字段，不注释则会校验失败报错
#     # issuer="https://platform.test.bohrium.com",
#     # audience="bb154829-8428-4fef-a110-b1066c752520",
#     algorithm="RS256",
# )

# CASE: 使用 Casdoor jwks 作为身份验证提供者
lab_auth = JWTVerifier(
    jwks_uri=AuthProvider.jwks_uri,
    # NOTE: casdoor 中没有提供标准的 OIDC（如/.well-known/openid-configuration），携带以下两个信息会失败
    # issuer="http://host.docker.internal:8000/",
    # audience="a387a4892ee19b1a2249",
    algorithm="RS256",  # 使用 RSA 算法，匹配 JWKS 中的 alg
)

# CASE: 使用对称加密算法 HS256，适用于测试环境
# lab_auth = JWTVerifier(
#     # 使用 RSA 公钥 (从 JWKS 的 x5c 证书中提取)
#     public_key="""-----BEGIN CERTIFICATE-----
# MIIE3TCCAsWgAwIBAgIDAeJAMA0GCSqGSIb3DQEBCwUAMCgxDjAMBgNVBAoTBWFkbWluMRYwFAYDVQQDEw1jZXJ0LWJ1aWx0LWluMB4XDTI0MDkwOTA5MjYxMVoXDTQ0MDkwOTA5MjYxMVowKDEOMAwGA1UEChMFYWRtaW4xFjAUBgNVBAMTDWNlcnQtYnVpbHQtaW4wggIiMA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQC3EnylZ2VurCm4gVtZHBUw67qvuKoYuU9whqaJr2UQEboIX4ca+FtZCjDgcBoD80lwSoYrcKpTG+DIVEMDznUHOjKwongRWclV1jeE3jZqObtmG9872yt/WX+nxQLyDrk+nUGhci6QrhgoYToN1DYaMqMV1Pi8catx8S0W3gg+ilb9mG3xdFpQo89o84mJhajTE/5/0jBuQ50Dx8CRolpRWjZ6i9RNVfFQglei+aW0RNf1PY6RqMkxc/Hy0XwXf/bjM5Ax7Aajwtehx0Q1zeUaRMMhFu6REtz345oJdLJpUkpFwJN4dPQ35a0tqnjkD1MLZjvBhSgOt5IPAJA1HmcR83RMBS8B3iV6y/clPjr02cjyasORy+kL/aFMfZfwvuRWX1NqRE99+rUTlPszH2SQi7PCUItQK72nnMYWBMXgyS8/Mra48q7LDAB/ZQnWuEG1+P1SdsQUWM2UaxkgjmfMNATVAgufrLOcOZDxAwVS7+quCF5f/QPTWaFqz5ofcpoUlf0iriv/k1mil7OghX0eqyLI2cCSma+dgB1eMni91eDCLVRT25mGDYreFjkpAwpMx2uaBk5e6ffT2jmZ2Zp9iCrUomLXDNiwY2wZDClcDKFiHNhNPAN3IbvBC3c6qpt0dLsWvGYW2IQTTnI71r/YY1XN/mTa4t/zwI+/kghjMQIDAQABoxAwDjAMBgNVHRMBAf8EAjAAMA0GCSqGSIb3DQEBCwUAA4ICAQBJUMBYJXnNihlGA2NMFIZMlsnW+5tjUqqK/Pv+oSptrqZxwDKFZL0NMxd4pVnLxIdU5HEcN2e01Xyqlaf5Tm3BZN6MaRVZAIRVfvxcNESQYA0jSFjsJzZUFGIQf8P9a5u+7qqSmj4tZx4XaRjOGSOf8t2RMJDmAbUeydLiD8nyCcxTzetmyYky8J3NBUoYGRbwU6KKbkxHbT35QheAb3jT4CELopLZ57Aa5Fb8xTjQ6tNqwZ+Z3993FkTOWPYLNLM1l46oN3g9yVY4ncGjUJkxsLTpAXB4I+wdqeew9XXexWNcY3cWWjA5VXgCNzntkPFM1D5IWkgP8MYVCvdv0Unfo78PahwVMoQMnDG4xLuS50gVKpukHLZQJNFPF0X4u/JeXauKPv/w7ssTTAK+8RIBYxBXQ72zDJNHyTqldR4efPHZfcW7OTmUr5FGNZThyW7ipvZRWcLM4u4IaWF2ncllOSqAXs1gDxkk201J7LrboZOjC3zgxE9HTCXpiszOAt5I38++5ufE3/hJW3ckz0jaJDeFqUphnn8eQhXPSwtCR8TL4ZpXSAFEpwahG+fCfZDK2KyPME33eXV3jtsYf0QHerYiMnP+tf1vAk3qtOzoE6Iv16fpBUvshk1Gm6E6bdhsP0hCrMwV4dm8uC3S52qcFiWZ6AC/HURaMbY+/lOs0A==
# -----END CERTIFICATE-----""",
#     issuer="http://localhost:8000",
#     audience="a387a4892ee19b1a2249",
#     algorithm="RS256",  # 使用 RSA 算法，匹配 JWKS 中的 alg
# )

ParamsType = Mapping[str, Union[str, int, float, None, Iterable[Union[str, int, float]]]]


# 通过ak获取当前用户信息✅
@lab_mcp.tool
async def show_user_info() -> dict[str, Any]:
    """
    Returns the user information from the access token.
    """
    access_token: AccessToken | None = get_access_token()
    if not access_token:
        return {"error": "Access token is required for this operation."}

    # 使用现有的 parse_user_info 方法从 AccessToken 的 claims 中解析用户信息
    user_info = AuthProvider.parse_user_info(access_token.claims)

    if not user_info or not user_info.id:
        return {
            "message": f"Hello, unknown! Your scopes are: {', '.join(access_token.scopes)}",
        }

    return {
        # "token":access_token.token,
        "id": user_info.id,
        "username": user_info.username,
        "email": user_info.email,
        "displayName": user_info.display_name,
        "avatarUrl": user_info.avatar_url,
        "extra": user_info.extra,
    }


# 获取实验室列表✅
@lab_mcp.tool
async def list_laboratories() -> dict:
    """
    Retrieve a list of laboratories using the internal lab API.
    Authentication is handled automatically on the server.

    Returns:
        dict: Operation result dictionary containing the following fields.

        Success:
            - success (bool): True if the operation succeeded.
            - labs (list[dict]): List of laboratory details. Each dictionary contains:
                - lab_uuid (str): Unique identifier of the laboratory.
                - other fields returned by the API.

        Failure:
            - success (bool): False
            - error (str): Description of the error.
    """
    try:
        url = f"{configs.Lab.Api}/api/v1/lab/list?page=1&page_size=1000"
        access_token = get_access_token()
        if not access_token:
            raise ValueError("Access token is required for this operation.")
        logger.info(f"Authorization: Bearer {access_token.token}")
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
        logger.info(f"Successfully retrieved {len(labs)} labs.")
        return {"success": True, "labs": labs}
    except requests.exceptions.RequestException as e:
        error_msg = f"Network error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}
    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}


# 获取实验室下所有设备✅
@lab_mcp.tool
async def list_laboratory_devices(lab_uuid: str, type: str = "device") -> dict:
    """
    Retrieve all devices or resources in a laboratory using the internal lab API.
    Authentication is handled automatically on the server.

    Args:
        lab_uuid (str): Unique identifier of the laboratory.
        type (str, optional): Type of resources to list, default is "device".

    Returns:
        dict: Operation result dictionary containing the following fields.

        Success:
            - success (bool): True if the operation succeeded.
            - devices (list[str]): List of device/resource names.
            - device_count (int): Number of devices/resources retrieved.

        Failure:
            - success (bool): False
            - error (str): Description of the error.
    """
    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        url = f"{configs.Lab.Api}/api/v1/lab/material/resource"
        headers = {
            "Authorization": f"Bearer {access_token.token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        params = {"lab_uuid": lab_uuid, "type": type}

        logger.info(f"Making request to {url}...")

        response = requests.get(url, headers=headers, params=params, timeout=configs.Lab.Timeout)
        response.raise_for_status()

        result = response.json()
        print(result)

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        data = result.get("data", {})
        devices = data.get("resource_name_list", [])
        logger.info(f"Successfully retrieved {len(devices)} devices for lab: {data.get('lab_name')}")

        return {"success": True, "devices": [d.get("name", "") for d in devices], "device_count": len(devices)}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}


# 获取实验室资源✅
@lab_mcp.tool
async def list_laboratory_resources(lab_uuid: str, type: str = "resources") -> dict:
    """
    Retrieve all resources in a laboratory using the internal lab API.
    Authentication is handled automatically on the server.

    Args:
        lab_uuid (str): Unique identifier of the laboratory.
        type (str, optional): Type of resources to list, default is "resources".

    Returns:
        dict: Operation result dictionary containing the following fields.

        Success:
            - success (bool): True if the operation succeeded.
            - devices (list[str]): List of all device/resource names in the laboratory.
            - resources_count (int): Number of devices/resources retrieved.

        Failure:
            - success (bool): False
            - error (str): Description of the error.
    """
    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        url = f"{configs.Lab.Api}/api/v1/lab/material/resource"
        headers = {
            "Authorization": f"Bearer {access_token.token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        params = {"lab_uuid": lab_uuid}

        logger.info(f"Making request to {url}...")

        response = requests.get(url, headers=headers, params=params, timeout=configs.Lab.Timeout)
        response.raise_for_status()
        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        data = result.get("data", {})
        devices = data.get("resource_name_list", [])
        logger.info(f"Successfully retrieved {len(devices)} devices for lab: {data.get('lab_name')}")

        return {"success": True, "devices": [d.get("name", "") for d in devices], "resources_count": len(devices)}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}


# 查询设备动作✅
@lab_mcp.tool
async def list_device_actions(
    lab_uuid: str,
    name: str,
) -> dict:
    """
    Retrieve available actions for a specific device using the internal lab API.
    Authentication is handled automatically on the server.

    Args:
        lab_uuid (str): Unique identifier of the laboratory.
        name (str): Name or ID of the device.

    Returns:
        dict: Operation result dictionary containing the following fields.

        Success:
            - success (bool): True if the operation succeeded.
            - device_id (str): Name or ID of the device.
            - actions (list[str]): List of available actions for the device.
            - action_count (int): Number of available actions.

        Failure:
            - success (bool): False
            - error (str): Description of the error.
    """
    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        url = f"{configs.Lab.Api}/api/v1/lab/material/device/actions"

        headers = {
            "Authorization": f"Bearer {access_token.token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        params = {"name": name, "lab_uuid": lab_uuid}

        logger.info(f"Making request to {url} for name {name}...")

        response = requests.get(url, headers=headers, params=params, timeout=configs.Lab.Timeout)
        response.raise_for_status()
        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        data = result.get("data", {})
        actions = data.get("actions", [])
        logger.info(f"Successfully retrieved {len(actions)} actions for name: {name}")

        return {"success": True, "device_id": data.get("name", ""), "actions": actions, "action_count": len(actions)}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}


# 对设备指定动作✅
@lab_mcp.tool
async def perform_device_action(
    lab_uuid: str,
    device_id: str,
    action_type: str,
    action: str,
    param: Optional[Any] = None,
) -> dict:
    """
    Perform a specific action on a device using the internal lab API.
    Authentication is handled automatically on the server.

    Args:
        lab_uuid (str): Unique identifier of the laboratory.
        device_id (str): ID of the device (as returned by `list_laboratory_devices`).
        action_type (str): Type of the action (refer to `list_device_actions` schema).
        action (str): Name of the action to perform (e.g., "test_latency", "create_resource").
        param (Optional[Any]): Parameters for the action. Can be a dict or a JSON string.
            If None, defaults to {"unilabos_device_id": device_id}.

    Returns:
        dict: Operation result dictionary containing the following fields.

        Success:
            - success (bool): True if the operation succeeded.
            - job_id (str): ID of the job created to perform the action.
            - status (str): Current status of the job.
            - return_info (dict): Optional returned information from the device/action.

        Failure:
            - success (bool): False
            - error (str): Description of the error.
    """
    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        url = f"{configs.Lab.Api}/api/v1/lab/mcp/run/action"
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

        logger.info(
            f"""Making POST request to {url} for device {device_id}
            with action {action}, payload keys: {list(payload.keys())}"""
        )

        response = requests.post(url, headers=headers, json=payload, timeout=configs.Lab.Timeout)
        response.raise_for_status()
        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg + f" response={result}")
            return {"error": error_msg, "success": False}

        data = result.get("data", {})
        feedback_data = data.get("feedback_data", {})

        return_info = json.loads(feedback_data.get("return_info", "{}"))

        return {
            "success": True,
            "job_id": data.get("job_id"),
            "status": data.get("status"),
            "return_info": return_info,
        }

    except requests.exceptions.Timeout:
        error_msg = "Request timed out when calling lab API"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except requests.exceptions.ConnectionError as e:
        error_msg = f"Connection error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except requests.exceptions.HTTPError as e:
        error_msg = f"HTTP error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except requests.exceptions.RequestException as e:
        error_msg = f"General request error: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}


# 查询设备状态
# @lab_mcp.tool
# async def get_device_status(device_id: str) -> dict:
#     """
#     Gets the status of a specific device by calling the internal lab API.

#     Args:
#         device_id: The ID of the device to get status for

#     Returns:
#         Dictionary containing device ID and status information, or an error.
#     """
#     try:
#         access_token = get_access_token()
#         if not access_token:
#             raise ValueError("API SecretKey is not configured on the server.")

#         url = f"{configs.Lab.Api}/api/environment/lab/mcp/device_status/"
#         params = {"secret_key": access_token.token, "device_id": device_id}

#         logger.info(f"Making request to {url} for device {device_id}...")

#         response = requests.get(url, params=params, timeout=configs.Lab.Timeout)
#         response.raise_for_status()

#         result = response.json()

#         if result.get("code") != 0:
#             error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
#             logger.error(error_msg)
#             return {"error": error_msg, "success": False}

#         data = result.get("data", {})
#         status = data.get("status", {})
#         logger.info(f"Successfully retrieved status for device: {device_id}")

#         return {"success": True, "device_id": data.get("device_id"), "statuses": status, "status_count": len(status)}

#     except requests.exceptions.RequestException as e:
#         error_msg = f"Network error when calling lab API: {str(e)}"
#         logger.error(error_msg)
#         return {"error": error_msg, "success": False}

#     except Exception as e:
#         error_msg = f"An unexpected error occurred: {str(e)}"
#         logger.error(error_msg)
#         return {"error": error_msg, "success": False}


# 获取工作流模版列表，如有标签就筛选标签✅
@lab_mcp.tool
def get_workflow_templates(
    page: int = 1,
    page_size: int = 30,
    timeout: int = 30,
    tag_filters: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Retrieve a paginated list of workflow templates using the internal lab API.
    Authentication is handled automatically on the server.

    Args:
        lab_uuid (str): The lab UUID.
        page (int, optional): Page number to retrieve, default is 1.
        page_size (int, optional): Number of templates per page, default is 30.
        timeout (int, optional): Request timeout in seconds, default is 30.
        tag_filters (Optional[List[str]]): List of tags to filter templates.
            - None or []: Return all templates.
            - Single value: Return templates that contain this tag.
            - Multiple values: Return templates that match all provided tags.
              (the request will expand into ?tags=tag1&tags=tag2)

    Returns:
        dict: Operation result dictionary containing the following fields.

        Success:
            - success (bool): True if the operation succeeded.
            - data (dict): Workflow template data returned by the API.
              If `tag_filters` is provided, only templates that match
              the given tags will be included.

        Failure:
            - success (bool): False
            - error (str): Description of the error.
    """

    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        url = f"{configs.Lab.Api}/api/v1/lab/workflow/template/list"

        headers = {
            "Authorization": f"Bearer {access_token.token}",
            "Accept": "application/json",
        }

        params = {
            "page": page,
            "page_size": page_size,
            "tag": tag_filters,
        }

        if tag_filters:
            params["tags"] = tag_filters
            logger.info(f"Applying tag filters: {tag_filters}")
        else:
            logger.info("No tag filters applied, retrieving all templates")

        logger.info(f"请求工作流模板列表: {url}, 参数: {params}")
        response = requests.get(url, headers=headers, params=params, timeout=timeout)
        response.raise_for_status()
        result = response.json()

        if result.get("code", 0) != 0:
            error_msg = f"API 返回错误: {result.get('msg', '未知错误')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        return {"success": True, "data": result.get("data")}

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


# 获取工作流列表✅
@lab_mcp.tool
def get_workflow_list(
    lab_uuid: str,
    page: int = 1,
    page_size: int = 30,
    timeout: int = 30,
) -> dict[str, Any]:
    """
    Retrieve a paginated list of workflows for a specific laboratory using the internal lab API.
    Authentication is handled automatically on the server.

    Args:
        lab_uuid (str): Unique identifier of the laboratory.
        page (int, optional): Page number to retrieve, default is 1.
        page_size (int, optional): Number of workflows per page, default is 30.
        timeout (int, optional): Request timeout in seconds, default is 30.

    Returns:
        dict: Operation result dictionary containing the following fields.

        Success:
            - success (bool): True if the operation succeeded.
            - data (dict): Workflow list data returned by the API.

        Failure:
            - success (bool): False
            - error (str): Description of the error.
    """
    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        url = f"{configs.Lab.Api}/api/v1/lab/workflow/owner/list"
        headers = {
            "Authorization": f"Bearer {access_token.token}",
            "Accept": "application/json",
        }
        from typing import Iterable, Mapping, Union

        params: ParamsType = {
            "page": page,
            "page_size": page_size,
            "lab_uuid": lab_uuid,
        }

        logger.info(f"请求工作流列表: {url}, 参数: {params}")
        response = requests.get(url, headers=headers, params=params, timeout=timeout)
        response.raise_for_status()
        result = response.json()

        if result.get("code", 0) != 0:
            error_msg = f"API 返回错误: {result.get('msg', '未知错误')}"
            logger.error(f"API 响应数据: {result}")
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        return {"success": True, "data": result.get("data")}

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
        logger.error(f"获取工作流列表失败: {str(e)}")
        return {
            "code": -1,
            "msg": f"获取工作流列表失败: {str(e)}",
            "data": {"count": 0, "next": None, "previous": None, "results": []},
        }


# publish工作流模版✅
@lab_mcp.tool
def create_workflow_template(uuid: str, description: str, published: bool = True, timeout: int = 30) -> Dict[str, Any]:
    """
    Create and optionally publish a workflow template using the internal lab API.
    Authentication is handled automatically on the server.

    Args:
        uuid (str): Unique identifier of the workflow.
        description (str): Description of the workflow template.
        published (bool, optional): Whether to publish the template immediately, default is True.
        timeout (int, optional): Request timeout in seconds, default is 30.

    Returns:
        dict: Operation result dictionary containing the following fields.

        Success:
            - success (bool): True if the template was created successfully.
            - data (dict): Data returned by the API (template details).

        Failure:
            - success (bool): False
            - error (str): Description of the error.
    """
    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        # 构建完整URL
        url = f"{configs.Lab.Api}/api/v1/lab/workflow/owner"
        headers = {
            "Authorization": f"Bearer {access_token.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        # 构建请求数据
        data = {"uuid": uuid, "description": description, "published": published}

        logger.info(f"创建工作流模板: {url}, 数据: {data}")

        # 发送POST请求
        response = requests.patch(url, headers=headers, json=data, timeout=timeout)
        response.raise_for_status()

        result = response.json()

        if result.get("code") != 0:
            error_msg = f"API returned an error: {result.get('msg', 'Unknown Error')}"
            logger.error(error_msg)
            return {"error": error_msg, "success": False}

        return {"code": 0, "msg": "工作流模板创建成功", "data": result.get("data")}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error when calling lab API: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}

    except Exception as e:
        logger.error(f"创建工作流模板失败: {str(e)}")
        return {"code": -1, "msg": f"创建工作流模板失败: {str(e)}", "data": None}


# fork工作流✅
@lab_mcp.tool
def fork_workflow_template(source_uuid: str, target_lab_uuid: str, name: str, timeout: int = 30) -> Dict[str, Any]:
    """
    Fork (duplicate) a workflow template into a specified laboratory using the internal lab API.
    Authentication is handled automatically on the server.
    The target laboratory UUID can be provided; if not, the default configured lab UUID is used.

    Args:
        source_uuid (str): UUID of the source workflow template.
        target_lab_uuid (str): UUID of the target laboratory.
        name (str): Name of the new workflow template.
        timeout (int, optional): Request timeout in seconds, default is 30.

    Returns:
        dict: Operation result dictionary containing the following fields.

        Success:
            - success (bool): True if the fork operation succeeded.
            - data (dict): Information about the newly created workflow template, including its UUID.

        Failure:
            - success (bool): False
            - error (str): Description of the error.
    """
    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        url = f"{configs.Lab.Api}/api/v1/lab/workflow/owner/duplicate"
        headers = {
            "Authorization": f"Bearer {access_token.token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        # # 使用配置中的实验室UUID
        # if lab_uuid == "default":
        #     lab_uuid = configs.Lab.UUID
        # 构建请求数据
        data = {
            "source_uuid": source_uuid,
            "target_lab_uuid": target_lab_uuid,
            "name": name,
        }

        logger.info(f"Fork工作流模板: {url}, 数据: {data}")

        # 发送Put请求
        response = requests.put(url, headers=headers, json=data, timeout=timeout)
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


# 运行指定工作流✅
@lab_mcp.tool
def run_workflow(workflow_uuid: str, timeout: int = 30) -> Dict[str, Any]:
    """
    Execute a specific workflow using the internal lab API.
    Authentication is handled automatically on the server.

    Args:
        workflow_uuid (str): UUID of the workflow to run.
        timeout (int, optional): Request timeout in seconds, default is 30.

    Returns:
        dict: Operation result dictionary.

        Success:
            - success (bool): True if the workflow was started successfully.
            - task_id (str): ID of the task created for this workflow run.
              Use this task_id with the `get_task` tool to query detailed task information.

        Failure:
            - success (bool): False
            - error (str): Description of the error.

    Note:
        After starting the workflow successfully, you should immediately query the task information
        using the returned `task_id` to monitor the workflow execution.
    """
    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        # 构建请求
        url = f"{configs.Lab.Api}/api/v1/lab/run/workflow"
        headers = {
            "Authorization": f"Bearer {access_token.token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }
        data = {"workflow_uuid": workflow_uuid}

        logger.info(f"运行工作流请求: {url}, data={data}")

        # 发送 PUT 请求
        response = requests.put(url, headers=headers, json=data, timeout=timeout)
        response.raise_for_status()

        result = response.json()

        logger.info(f"运行工作流响应: {result}")

        # 检查返回的 code
        if result.get("code", 0) != 0:
            error_msg = f"API 返回错误: {result.get('msg', '未知错误')}"
            logger.error(error_msg)
            return {"code": result.get("code", -1), "msg": error_msg, "data": None}

        return {"code": 0, "msg": "工作流运行成功", "task_id": result.get("data")}

    except requests.exceptions.Timeout:
        logger.error("运行工作流超时")
        return {"code": -1, "msg": "请求超时", "data": None}
    except requests.exceptions.ConnectionError:
        logger.error("运行工作流连接错误")
        return {"code": -1, "msg": "无法连接到服务器", "data": None}
    except requests.exceptions.RequestException as e:
        logger.error(f"运行工作流请求异常: {str(e)}")
        return {"code": -1, "msg": f"请求失败: {str(e)}", "data": None}
    except Exception as e:
        logger.error(f"运行工作流未知异常: {str(e)}")
        return {"code": -1, "msg": f"运行工作流失败: {str(e)}", "data": None}


# 查询工作流task详细信息
@lab_mcp.tool
def get_task(task_id: str, timeout: int = 30) -> Dict[str, Any]:
    """
    Retrieve detailed information about a workflow task using the internal lab API.
    Authentication is handled automatically on the server.

    Args:
        task_id (str): Unique identifier of the task.
        timeout (int, optional): Request timeout in seconds, default is 30.

    Returns:
        dict: Operation result dictionary.

        Success:
            - success (bool): True if the task information was retrieved successfully.
            - data (dict): Detailed information about the task returned by the API.

        Failure:
            - success (bool): False
            - error (str): Description of the error.

    Notes:
        Use this function to monitor the status and results of a workflow run using its task ID.
    """

    try:
        access_token = get_access_token()
        if not access_token:
            raise ValueError("API SecretKey is not configured on the server.")

        url = f"{configs.Lab.Api}/api/v1/lab/mcp/task/{task_id}"
        headers = {
            "Authorization": f"Bearer {access_token.token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        logger.info(f"请求 task 详细信息: {url}")
        response = requests.get(url, headers=headers, timeout=timeout)
        response.raise_for_status()
        result = response.json()

        if result.get("code", 0) != 0:
            error_msg = f"API 返回错误: {result.get('msg', '未知错误')}"
            logger.error(error_msg)
            return {"code": -1, "msg": error_msg, "data": {}}

        return {"success": True, "data": result.get("data")}

    except requests.exceptions.Timeout:
        logger.error("请求超时")
        return {"code": -1, "msg": "请求超时", "data": {}}

    except requests.exceptions.ConnectionError:
        logger.error("连接错误")
        return {"code": -1, "msg": "无法连接到服务器", "data": {}}

    except requests.exceptions.RequestException as e:
        logger.error(f"请求异常: {str(e)}")
        return {"code": -1, "msg": f"请求失败: {str(e)}", "data": {}}

    except ValueError as e:
        logger.error(f"配置错误: {e}")
        return {"code": -1, "msg": str(e), "data": {}}

    except Exception as e:
        logger.error(f"未知错误: {e}", exc_info=True)
        return {"code": -1, "msg": f"未知错误: {str(e)}", "data": {}}
