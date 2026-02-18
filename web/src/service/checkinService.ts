import { http } from "@/service/http/client";

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
  async checkIn(): Promise<CheckInResponse> {
    return http.post("/xyzen/api/v1/checkin/check-in");
  }

  async getStatus(): Promise<CheckInStatusResponse> {
    return http.get("/xyzen/api/v1/checkin/check-in/status");
  }

  async getHistory(
    limit: number = 30,
    offset: number = 0,
  ): Promise<CheckInRecordResponse[]> {
    return http.get("/xyzen/api/v1/checkin/check-in/history", {
      params: { limit, offset },
    });
  }

  async getMonthlyCheckIns(
    year: number,
    month: number,
  ): Promise<CheckInRecordResponse[]> {
    return http.get(`/xyzen/api/v1/checkin/check-in/monthly/${year}/${month}`);
  }

  async getDayConsumption(date: string): Promise<DayConsumptionResponse> {
    return http.get(`/xyzen/api/v1/checkin/check-in/consumption/${date}`);
  }

  async getConsumptionRange(
    startDate: string,
    endDate: string,
    tz: string = "Asia/Shanghai",
  ): Promise<ConsumptionRangeResponse> {
    return http.get("/xyzen/api/v1/checkin/consumption/range", {
      params: { start_date: startDate, end_date: endDate, tz },
    });
  }

  async getConsumptionRecords(
    limit: number = 20,
    offset: number = 0,
    startDate?: string,
    endDate?: string,
    tz: string = "Asia/Shanghai",
  ): Promise<UserConsumeRecordsPage> {
    return http.get("/xyzen/api/v1/checkin/consumption/records", {
      params: {
        limit,
        offset,
        tz,
        start_date: startDate,
        end_date: endDate,
      },
    });
  }
}

export const checkInService = new CheckInService();
