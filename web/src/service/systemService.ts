import { useXyzen } from "@/store";
import type { BackendVersionInfo } from "@/types/version";

class SystemService {
  private getBackendUrl(): string {
    const { backendUrl } = useXyzen.getState();
    if (!backendUrl || backendUrl === "") {
      if (typeof window !== "undefined") {
        return `${window.location.protocol}//${window.location.host}`;
      }
    }
    return backendUrl;
  }

  /**
   * Get the backend system version information
   */
  async getVersion(): Promise<BackendVersionInfo> {
    const response = await fetch(
      `${this.getBackendUrl()}/xyzen/api/v1/system/version`,
    );

    if (!response.ok) {
      throw new Error("Failed to fetch version");
    }

    return response.json();
  }
}

export const systemService = new SystemService();
