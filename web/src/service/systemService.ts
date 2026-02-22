import { http } from "@/service/http/client";
import type { BackendVersionInfo } from "@/types/version";

class SystemService {
  async getVersion(): Promise<BackendVersionInfo> {
    return http.get("/xyzen/api/v1/system/version", { auth: false });
  }

  async getEdition(): Promise<{ edition: string }> {
    return http.get("/xyzen/api/v1/system/edition", { auth: false });
  }

  async getRegion(): Promise<{ region: string }> {
    return http.get("/xyzen/api/v1/system/region", { auth: false });
  }
}

export const systemService = new SystemService();
