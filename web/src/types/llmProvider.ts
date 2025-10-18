export interface LlmProvider {
  id: string;
  name: string;
  api: string;
  key: string;
  model: string;
  provider_type: string;
  max_tokens: number;
  temperature: number;
  timeout: number;
  is_default: boolean;
  is_system: boolean;
  user_id: string;
}

export interface LlmProviderCreate {
  name: string;
  api: string;
  key: string;
  model: string;
  provider_type: string;
  max_tokens?: number;
  temperature?: number;
  timeout?: number;
  user_id: string;
  is_default?: boolean;
}

export interface LlmProviderUpdate {
  name?: string;
  api?: string;
  key?: string;
  model?: string;
  provider_type?: string;
  max_tokens?: number;
  temperature?: number;
  timeout?: number;
  is_default?: boolean;
}

export type LlmProviderResponse = LlmProvider;

export interface SetDefaultProviderRequest {
  provider_id: string;
}

export interface ProviderTemplate {
  type: string;
  display_name: string;
  description: string;
  required_fields: string[];
  optional_fields: string[];
  default_config: Record<string, string | number | boolean>;
}
