/**
 * Smithery Service
 * Encapsulates Smithery Registry API calls
 */

import { useXyzen } from "@/store";
import type {
  SmitheryServersListResponse,
  SmitheryServersQuery,
} from "../types/smithery";

// 始终走后端代理，不再直连 Smithery；后端负责注入/管理密钥
const getSmitheryBaseUrl = () => {
  const backendUrl = useXyzen.getState().backendUrl;
  if (!backendUrl) {
    throw new Error(
      "backendUrl is not set. Configure it via UI settings before using Smithery.",
    );
  }
  return `${backendUrl}/xyzen/api/smithery`;
};

export class SmitheryService {
  async listServers(
    params: SmitheryServersQuery = {},
  ): Promise<SmitheryServersListResponse> {
    const base = getSmitheryBaseUrl();
    const url = new URL(`${base}/servers`);

    if (params.q) url.searchParams.set("q", params.q);
    if (params.profile) url.searchParams.set("profile", params.profile);
    if (params.page) url.searchParams.set("page", String(params.page));
    if (params.pageSize)
      url.searchParams.set("pageSize", String(params.pageSize));

    const headers: HeadersInit = { "Content-Type": "application/json" };

    // 不再在前端附加 Authorization；后端代理负责认证

    const resp = await fetch(url.toString(), { headers, method: "GET" });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Smithery listServers failed: ${resp.status} ${text}`);
    }
    const data = (await resp.json()) as SmitheryServersListResponse;
    // Basic shape validation
    if (!data || !Array.isArray(data.servers) || !data.pagination) {
      throw new Error("Invalid Smithery response shape");
    }
    return data;
  }

  async getServer(id: string) {
    const base = getSmitheryBaseUrl();
    const url = `${base}/servers/${encodeURIComponent(id)}`;
    const headers: HeadersInit = { "Content-Type": "application/json" };

    const resp = await fetch(url, { headers, method: "GET" });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Smithery getServer failed: ${resp.status} ${text}`);
    }
    return (await resp.json()) as import("../types/smithery").SmitheryServerDetail;
  }
}

export const smitheryService = new SmitheryService();
