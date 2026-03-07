import { http } from "@/service/http/client";

export interface BetaSurveyRequest {
  discovery_channel: string;
  occupation: string;
  problem_to_solve: string;
}

export interface BetaSurveyResponse {
  id: string;
  user_id: string | null;
  discovery_channel: string;
  occupation: string;
  problem_to_solve: string;
  created_at: string;
}

export interface InternalApplicationRequest {
  company_name: string;
  company_email: string;
  real_name: string;
  reason: string;
  application_items: string[];
}

export interface InternalApplicationResponse {
  id: string;
  user_id: string;
  company_name: string;
  company_email: string;
  real_name: string;
  reason: string;
  application_items: string[];
  status: string;
  serial_number: string;
  certificate_token: string;
  created_at: string;
  updated_at: string;
}

export interface RedemptionCodeInfo {
  code: string;
  code_type: string;
  role_name: string | null;
  amount: number;
  duration_days: number;
  current_usage: number;
  max_usage: number;
  is_active: boolean;
  created_at: string;
}

export interface AdminApplicationEntry {
  id: string;
  user_id: string;
  username: string | null;
  company_name: string;
  company_email: string;
  real_name: string;
  reason: string;
  application_items: string[];
  status: string;
  serial_number: string;
  redemption_code_id: string | null;
  created_at: string;
  updated_at: string;
  total_credits_granted: number;
  redemption_code: RedemptionCodeInfo | null;
  redeemed_at: string | null;
}

export interface ApproveApplicationParams {
  code_type: string;
  amount: number;
  role_name?: string;
  duration_days: number;
  description?: string;
  max_usage: number;
}

class ApplicationService {
  async submitSurvey(data: BetaSurveyRequest): Promise<BetaSurveyResponse> {
    return http.post("/xyzen/api/v1/applications/survey", data);
  }

  async getMySurvey(): Promise<BetaSurveyResponse | null> {
    return http.get("/xyzen/api/v1/applications/survey/mine");
  }

  async submitApplication(
    data: InternalApplicationRequest,
  ): Promise<InternalApplicationResponse> {
    return http.post("/xyzen/api/v1/applications/internal", data);
  }

  async getMyApplications(): Promise<InternalApplicationResponse[]> {
    return http.get("/xyzen/api/v1/applications/internal/mine");
  }

  async adminListApplications(
    adminSecret: string,
    limit = 50,
    offset = 0,
    search?: string,
    company?: string,
  ): Promise<{ applications: AdminApplicationEntry[]; total: number }> {
    return http.get("/xyzen/api/v1/admin/applications", {
      params: {
        limit,
        offset,
        ...(search ? { search } : {}),
        ...(company ? { company } : {}),
      },
      headers: { "X-Admin-Secret": adminSecret },
    });
  }

  async adminGetCompanies(adminSecret: string): Promise<string[]> {
    return http.get("/xyzen/api/v1/admin/applications/companies", {
      headers: { "X-Admin-Secret": adminSecret },
    });
  }

  async adminApproveApplication(
    adminSecret: string,
    appId: string,
    params: ApproveApplicationParams,
  ): Promise<AdminApplicationEntry> {
    return http.post(
      `/xyzen/api/v1/admin/applications/${appId}/approve`,
      params,
      { headers: { "X-Admin-Secret": adminSecret } },
    );
  }

  async adminRejectApplication(
    adminSecret: string,
    appId: string,
  ): Promise<AdminApplicationEntry> {
    return http.post(
      `/xyzen/api/v1/admin/applications/${appId}/reject`,
      {},
      { headers: { "X-Admin-Secret": adminSecret } },
    );
  }
}

export const applicationService = new ApplicationService();
