import json
import logging

import requests
from fastmcp import FastMCP

from core.configs import configs

logger = logging.getLogger(__name__)

dify_mcp: FastMCP = FastMCP(name="Dify Workflows 🚀")


@dify_mcp.tool
async def translate_bio_workflow(experiment_description: str) -> dict:
    """
    An expert in biological experiment process automation,
    capable of transforming various biological experiment descriptions
    into precise, machine-executable experimental steps.

    Args:
        experiment_description: The biological experiment description to be translated.

    Returns:
        A dictionary containing the translated labware_info and steps_info, or an error message.
    """
    try:
        dify_api_url = configs.Dify.DifyApi
        dify_api_key = configs.Dify.DifyKey1
        dify_timeout = configs.Dify.Timeout

        if not dify_api_url or not dify_api_key:
            raise ValueError("Dify API URL or Key is not configured.")

        headers = {"Authorization": f"Bearer {dify_api_key}", "Content-Type": "application/json"}

        payload = {
            "inputs": {"paragraph": experiment_description},  # Changed key from experiment_description to paragraph
            "response_mode": "blocking",  # blocking or streaming
            "user": "xyzen-user",  # Added required user field
        }

        logger.info(f"Sending translation request to Dify API: {dify_api_url}/workflows/run")

        response = requests.post(
            f"{dify_api_url}/workflows/run",
            headers=headers,
            json=payload,
            timeout=dify_timeout,
            stream=(payload["response_mode"] == "streaming"),
        )
        response.raise_for_status()

        result = response.json()

        # Access the outputs from the 'data' field
        data = result.get("data", {})
        outputs = data.get("outputs", {})

        labware_info_str = outputs.get("labware_info", "N/A")
        steps_info_str = outputs.get("steps_info", "N/A")

        labware_info = "N/A"
        steps_info = "N/A"

        try:
            if labware_info_str != "N/A":
                labware_info = json.loads(labware_info_str)
        except json.JSONDecodeError:
            logger.error(f"Failed to decode labware_info: {labware_info_str}")

        try:
            if steps_info_str != "N/A":
                # Extract JSON from markdown code block if present
                if steps_info_str.startswith("```json"):
                    start_index = steps_info_str.find("```json") + len("```json")
                    end_index = steps_info_str.rfind("```")
                    if start_index != -1 and end_index != -1 and start_index < end_index:
                        json_string = steps_info_str[start_index:end_index].strip()
                        steps_info = json.loads(json_string)
                    else:
                        logger.warning("steps_info starts with ```json but could not extract JSON block.")
                        steps_info = steps_info_str  # Fallback to raw string
                else:
                    steps_info = json.loads(steps_info_str)  # Assume it's directly JSON string
        except json.JSONDecodeError:
            logger.error(f"Failed to decode steps_info: {steps_info_str}")

        logger.info("Translation successful.")
        return {"success": True, "labware_info": labware_info, "steps_info": steps_info}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error or Dify API request failed: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}
    except Exception as e:
        error_msg = f"An unexpected error occurred: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}


@dify_mcp.tool
async def translate_organic_workflow(experiment_description: str) -> dict:
    """
    An expert in organic experiment process automation, capable of transforming various organic experiment descriptions
    into precise, machine-executable experimental steps.

    Args:
        experiment_description: The organic experiment description to be translated.

    Returns:
        A dictionary containing the translated xdl (string) and workflow (object), or an error message.
    """
    try:
        dify_api_url = configs.Dify.DifyApi
        dify_api_key = configs.Dify.DifyKey2
        dify_timeout = configs.Dify.Timeout

        if not dify_api_url or not dify_api_key:
            raise ValueError("Dify API URL or Key is not configured.")

        headers = {"Authorization": f"Bearer {dify_api_key}", "Content-Type": "application/json"}

        payload = {
            "inputs": {"paragraph": experiment_description},  # Changed key from experiment_description to paragraph
            "response_mode": "blocking",
            "user": "xyzen-user",  # Added required user field
        }

        logger.info(f"Sending translation request to Dify API for organic workflow: {dify_api_url}/workflows/run")

        response = requests.post(
            f"{dify_api_url}/workflows/run",
            headers=headers,
            json=payload,
            timeout=dify_timeout,
            stream=(payload["response_mode"] == "streaming"),
        )
        response.raise_for_status()

        result = response.json()

        # Access the outputs from the 'data' field
        data = result.get("data", {})
        outputs = data.get("outputs", {})

        xdl = outputs.get("xdl", "N/A")
        workflow = outputs.get(
            "workflow", {}
        )  # Assuming workflow is already a dict, or can be an empty dict if not present

        logger.info("Organic workflow translation successful.")
        return {"success": True, "xdl": xdl, "workflow": workflow}

    except requests.exceptions.RequestException as e:
        error_msg = f"Network error or Dify API request failed for organic workflow: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}
    except Exception as e:
        error_msg = f"An unexpected error occurred for organic workflow: {str(e)}"
        logger.error(error_msg)
        return {"error": error_msg, "success": False}
