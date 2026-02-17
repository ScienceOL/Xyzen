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
  tool_call_count: number;
  message: string | null;
  by_tier: Record<string, TierStats>;
}

export interface TierStats {
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  total_amount: number;
  record_count: number;
  tool_call_count: number;
}

export interface ConsumptionRangeResponse {
  daily: DayConsumptionResponse[];
  by_tier: Record<string, TierStats>;
  total_tool_call_count: number;
}

export interface UserConsumeRecord {
  id: string;
  biz_no: number | null;
  amount: number;
  scene: string | null;
  model_tier: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  consume_state: string;
  created_at: string;
}

export interface UserConsumeRecordsPage {
  records: UserConsumeRecord[];
  total: number;
  limit: number;
  offset: number;
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

  /**
   * Get consumption range statistics (daily breakdown, tier and scene distribution)
   */
  async getConsumptionRange(
    startDate: string,
    endDate: string,
    tz: string = "Asia/Shanghai",
  ): Promise<ConsumptionRangeResponse> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      tz,
    });
    const url = `${this.getBackendUrl()}/xyzen/api/v1/checkin/consumption/range?${params}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.createAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to get consumption range");
    }

    return response.json();
  }

  /**
   * Get paginated consumption records
   */
  async getConsumptionRecords(
    limit: number = 20,
    offset: number = 0,
    startDate?: string,
    endDate?: string,
    tz: string = "Asia/Shanghai",
  ): Promise<UserConsumeRecordsPage> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      tz,
    });
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    const url = `${this.getBackendUrl()}/xyzen/api/v1/checkin/consumption/records?${params}`;

    const response = await fetch(url, {
      method: "GET",
      headers: this.createAuthHeaders(),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || "Failed to get consumption records");
    }

    return response.json();
  }
}

export const checkInService = new CheckInService();
