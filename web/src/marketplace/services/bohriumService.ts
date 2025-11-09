/**
 * Bohrium Service
 * 封装 Bohrium 平台 API 调用
 */

import { useXyzen } from "@/store";
import type {
  BohriumApiResponse,
  BohriumAppDetail,
  BohriumAppListResponse,
  BohriumAuthConfig,
  BohriumMcpConfig,
} from "../types/bohrium";

const getBohriumBseUrl = () => {
  const backendUrl = useXyzen.getState().backendUrl;
  if (!backendUrl) {
    throw new Error(
      "backendUrl is not set. Configure it via UI settings before using Bohrium.",
    );
  }
  return `${backendUrl}`;
};

const BACKEND_URL = getBohriumBseUrl();

const BOHRIUM_BASE_URL = `${BACKEND_URL}/xyzen/api/bohrium/v1`;
const BOHRIUM_OPENAPI_URL = `${BACKEND_URL}/xyzen/api/openapi/v1`;

/**
 * 从 localStorage 获取 Bohrium 认证信息
 */
const getBohriumAuth = (): BohriumAuthConfig | null => {
  try {
    const accessToken = localStorage.getItem("access_token");
    if (!accessToken) {
      console.warn("Bohrium: No access_token found in localStorage");
      return null;
    }

    return {
      accessKey: accessToken,
      appKey: "xyzen-uuid1760783737", // 可以配置化
    };
  } catch (error) {
    console.error("Failed to get Bohrium auth:", error);
    return null;
  }
};

/**
 * 创建带认证的请求头
 */
const createBohriumHeaders = (auth: BohriumAuthConfig | null): HeadersInit => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (auth) {
    headers["accessKey"] = auth.accessKey;
    headers["x-app-key"] = auth.appKey;
  }

  return headers;
};

/**
 * Bohrium Service 类
 */
class BohriumService {
  /**
   * 获取 MCP 应用列表
   */
  async getAppList(
    page = 1,
    pageSize = 36,
    search = "",
  ): Promise<BohriumAppListResponse> {
    try {
      const params = new URLSearchParams({
        appTypes: "6", // MCP 类型
        orderBy: "default",
        search,
        page: page.toString(),
        pageSize: pageSize.toString(),
      });

      const response = await fetch(
        `${BOHRIUM_BASE_URL}/square/app/app_list?${params}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch Bohrium app list: ${response.status}`);
      }

      const data: BohriumApiResponse<BohriumAppListResponse> =
        await response.json();

      if (data.code !== 0) {
        throw new Error(data.message || "Failed to fetch app list");
      }

      return data.data;
    } catch (error) {
      console.error("Failed to fetch Bohrium app list:", error);
      throw error;
    }
  }

  /**
   * 获取应用详情（包含 latestDeploymentId）
   */
  async getAppDetail(appKey: string): Promise<BohriumAppDetail> {
    const auth = getBohriumAuth();
    if (!auth) {
      throw new Error("Not authenticated with Bohrium");
    }

    try {
      const params = new URLSearchParams({
        appKey,
      });

      const response = await fetch(
        `${BOHRIUM_OPENAPI_URL}/square/app/detail?${params}`,
        {
          method: "GET",
          headers: createBohriumHeaders(auth),
        },
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch Bohrium app detail: ${response.status}`,
        );
      }

      const data: BohriumApiResponse<BohriumAppDetail> = await response.json();

      if (data.code !== 0) {
        throw new Error(data.message || "Failed to fetch app detail");
      }

      return data.data;
    } catch (error) {
      console.error("Failed to fetch Bohrium app detail:", error);
      throw error;
    }
  }

  /**
   * 获取 MCP 服务端点配置
   */
  async getMcpEndpoint(deploymentId: number): Promise<{
    url: string;
    token: string;
  }> {
    const auth = getBohriumAuth();
    if (!auth) {
      throw new Error("Not authenticated with Bohrium");
    }

    try {
      const params = new URLSearchParams({
        deployId: deploymentId.toString(),
      });

      const response = await fetch(
        `${BOHRIUM_OPENAPI_URL}/square/app/mcp_service_config?${params}`,
        {
          method: "GET",
          headers: createBohriumHeaders(auth),
        },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch MCP endpoint: ${response.status}`);
      }

      const data: BohriumApiResponse<BohriumMcpConfig> = await response.json();

      if (data.code !== 0) {
        throw new Error(data.message || "Failed to fetch MCP endpoint");
      }

      // 提取第一个 MCP server 配置
      const mcpServers = data.data.mcpServers;
      const firstServerKey = Object.keys(mcpServers)[0];

      if (!firstServerKey) {
        throw new Error("No MCP server configuration found");
      }

      const serverUrl = mcpServers[firstServerKey].url;

      // 从 URL 中提取 token
      const urlObj = new URL(serverUrl);
      const token = urlObj.searchParams.get("token");

      if (!token) {
        throw new Error("No token found in MCP endpoint URL");
      }

      return {
        url: serverUrl,
        token,
      };
    } catch (error) {
      console.error("Failed to fetch MCP endpoint:", error);
      throw error;
    }
  }

  /**
   * 轮询获取 MCP 端点（处理沙盒启动延迟）
   */
  async waitForMcpEndpoint(
    deploymentId: number,
    maxRetries = 15,
    retryInterval = 3000,
    onProgress?: (retryCount: number, maxRetries: number) => void,
  ): Promise<{ url: string; token: string }> {
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        onProgress?.(i + 1, maxRetries);

        const endpoint = await this.getMcpEndpoint(deploymentId);
        return endpoint;
      } catch (error) {
        lastError = error as Error;
        console.log(
          `Attempt ${i + 1}/${maxRetries} failed, retrying in ${retryInterval}ms...`,
        );

        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, retryInterval));
        }
      }
    }

    throw new Error(
      `Failed to get MCP endpoint after ${maxRetries} attempts: ${lastError?.message}`,
    );
  }

  /**
   * 检查是否已认证
   */
  isAuthenticated(): boolean {
    return getBohriumAuth() !== null;
  }
}

// 导出单例
export const bohriumService = new BohriumService();
