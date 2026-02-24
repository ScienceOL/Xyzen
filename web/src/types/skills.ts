export type SkillScope = "builtin" | "user";

export interface SkillRead {
  id: string;
  name: string;
  description: string;
  scope: SkillScope;
  user_id: string | null;
  license: string | null;
  compatibility: string | null;
  metadata_json: Record<string, unknown> | null;
  resource_prefix: string | null;
  root_folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface SkillResourceInput {
  path: string;
  content: string;
}

export interface SkillParseRequest {
  skill_md: string;
  resources?: SkillResourceInput[];
}

export interface SkillParseResponse {
  valid: boolean;
  name?: string | null;
  description?: string | null;
  error?: string | null;
}

export interface SkillCreateRequest {
  name: string;
  description: string;
  skill_md: string;
  license?: string | null;
  compatibility?: string | null;
  metadata_json?: Record<string, unknown> | null;
  resources?: SkillResourceInput[];
}

export interface AttachSkillRequest {
  skill_id: string;
}
