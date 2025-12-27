import { authService } from "@/service/authService";
import { useXyzen } from "@/store";

export interface CheckInResponse {
  success: boolean;
  consecutive_days: number;
  points_awarded: number;
  new_balance: number;
  message: string;
}

export interface CheckInStatusResponse {
  checked_in_today: boolean;
  consecutive_days: number;
  next_points: number;
  total_check_ins: number;
}

export interface CheckInRecordResponse {
  id: string;
  user_id: string;
  check_in_date: string;
  consecutive_days: number;
  points_awarded: number;
  created_at: string;
}

export interface DayConsumptionResponse {
  date: string;
  total_amount: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  record_count: number;
  message: string | null;
}

class CheckInService {
  private getBackendUrl(): string {
    const { backendUrl } = useXyzen.getState();
    if (!backendUrl || backendUrl === "") {
      if (typeof window !== "undefined") {
        return `${window.location.protocol}//${window.location.host}`;
      }
    }
    return backendUrl;
  }

  private createAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    const token = authService.getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Perform daily check-in
   */
  async checkIn(): Promise<CheckInResponse> {
    const url = `${this.getBackendUrl()}/xyzen/api/v1/checkin/check-in`;

    const response = await fetch(url, {
      method: "POST",
      headers: this.createAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to check in");
    }

    return response.json();
  }

  /**
   * Get check-in status
   */
  async getStatus(): Promise<CheckInStatusResponse> {
    const url = `${this.getBackendUrl()}/xyzen/api/v1/checkin/check-in/status`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.createAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to get check-in status");
    }

    return response.json();
  }

  /**
   * Get check-in history
   */
  async getHistory(
    limit: number = 30,
    offset: number = 0,
  ): Promise<CheckInRecordResponse[]> {
    const url = `${this.getBackendUrl()}/xyzen/api/v1/checkin/check-in/history?limit=${limit}&offset=${offset}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.createAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to get check-in history");
    }

    return response.json();
  }

  /**
   * Get monthly check-in records
   */
  async getMonthlyCheckIns(
    year: number,
    month: number,
  ): Promise<CheckInRecordResponse[]> {
    const url = `${this.getBackendUrl()}/xyzen/api/v1/checkin/check-in/monthly/${year}/${month}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.createAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to get monthly check-in records");
    }

    return response.json();
  }

  /**
   * Get day consumption statistics
   */
  async getDayConsumption(date: string): Promise<DayConsumptionResponse> {
    const url = `${this.getBackendUrl()}/xyzen/api/v1/checkin/check-in/consumption/${date}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.createAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to get day consumption");
    }

    return response.json();
  }
}

export const checkInService = new CheckInService();
