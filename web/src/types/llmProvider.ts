export enum ProviderScope {
  SYSTEM = "system",
  USER = "user",
  ORGANIZATION = "org",
}

export enum ModelMode {
  CHAT = "chat",
  EMBEDDING = "embedding",
  COMPLETION = "completion",
}

export enum Modality {
  TEXT = "text",
  IMAGE = "image",
  AUDIO = "audio",
  VIDEO = "video",
}

export enum LiteLLMProvider {
  OPENAI = "openai",
  AZURE = "azure",
  GEMINI = "gemini",
  VERTEX_AI = "vertex_ai-language-models",
}

export interface RawModelConfig {
  // Core required fields
  model_name: string;
  litellm_provider: LiteLLMProvider;
  mode: ModelMode;

  // Optional token limits
  max_tokens?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;

  // Cost fields
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  cache_read_input_token_cost?: number;

  // OpenAI/Azure specific cost fields
  cache_read_input_token_cost_flex?: number;
  cache_read_input_token_cost_priority?: number;
  input_cost_per_token_flex?: number;
  input_cost_per_token_priority?: number;
  input_cost_per_token_batches?: number;
  output_cost_per_token_flex?: number;
  output_cost_per_token_priority?: number;
  output_cost_per_token_batches?: number;

  // Google/Gemini specific fields
  input_cost_per_audio_token?: number;
  input_cost_per_token_above_200k_tokens?: number;
  output_cost_per_reasoning_token?: number;
  output_cost_per_token_above_200k_tokens?: number;
  cache_creation_input_token_cost_above_200k_tokens?: number;
  cache_read_input_token_cost_above_200k_tokens?: number;

  max_audio_length_hours?: number;
  max_audio_per_prompt?: number;
  max_images_per_prompt?: number;
  max_videos_per_prompt?: number;
  max_video_length?: number;
  max_pdf_size_mb?: number;

  // Rate limits and metadata
  rpm?: number;
  tpm?: number;
  source?: string;

  // Supported lists
  supported_endpoints?: string[];
  supported_modalities?: Modality[];
  supported_output_modalities?: Modality[];

  // Feature flags
  supports_function_calling?: boolean;
  supports_parallel_function_calling?: boolean;
  supports_vision?: boolean;
  supports_audio_input?: boolean;
  supports_audio_output?: boolean;
  supports_video_input?: boolean;
  supports_pdf_input?: boolean;
  supports_prompt_caching?: boolean;
  supports_response_schema?: boolean;
  supports_system_messages?: boolean;
  supports_tool_choice?: boolean;
  supports_reasoning?: boolean;
  supports_native_streaming?: boolean;
  supports_service_tier?: boolean;
  supports_url_context?: boolean;
  supports_web_search?: boolean;
}

export interface ModelConfig extends RawModelConfig {
  provider_type: string;
}

export type ModelRegistry = Record<string, RawModelConfig[]>;

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
  scope?: ProviderScope;
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
  models: RawModelConfig[];
}
