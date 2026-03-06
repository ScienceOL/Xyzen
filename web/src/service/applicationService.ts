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
}

export const applicationService = new ApplicationService();
