#![allow(dead_code)]

use std::collections::BTreeMap;

use llm_adapter::core::CoreToolDefinition;
use napi_derive::napi;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PromptRenderContract {
  pub messages: Vec<PromptMessageContract>,
  #[napi(ts_type = "Record<string, any>")]
  pub template_params: Value,
  #[napi(ts_type = "Record<string, any>")]
  pub render_params: Value,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, JsonSchema)]
pub struct PromptRenderResult {
  pub messages: Vec<PromptMessageContract>,
  pub warnings: Vec<String>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct BuiltInPromptRenderContract {
  pub name: String,
  #[napi(ts_type = "Record<string, any>")]
  pub render_params: Value,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, JsonSchema)]
pub struct PromptTokenCountContract {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub model: Option<String>,
  pub messages: Vec<PromptCountMessage>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, JsonSchema)]
pub struct PromptTokenCountResult {
  pub tokens: u32,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, JsonSchema)]
pub struct PromptCountMessage {
  pub content: String,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct PromptMetadataContract {
  pub messages: Vec<PromptMessageContract>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PromptMetadataResult {
  pub param_keys: Vec<String>,
  #[napi(ts_type = "Record<string, any>")]
  pub template_params: Value,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PromptSessionContract {
  pub prompt: PromptSessionPrompt,
  pub turns: Vec<PromptMessageContract>,
  #[napi(ts_type = "Record<string, any>")]
  pub render_params: Value,
  pub max_token_size: u32,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PromptSessionPrompt {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub action: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub model: Option<String>,
  pub prompt_tokens: u32,
  #[napi(ts_type = "Record<string, any>")]
  pub template_params: Value,
  pub messages: Vec<PromptMessageContract>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PromptSessionResult {
  pub messages: Vec<PromptMessageContract>,
  pub warnings: Vec<String>,
  pub prompt_message_positions: Vec<u32>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BuiltInPromptSessionContract {
  pub name: String,
  pub turns: Vec<PromptMessageContract>,
  #[napi(ts_type = "Record<string, any>")]
  pub render_params: Value,
  pub max_token_size: u32,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PromptMessageContract {
  #[napi(ts_type = "'system' | 'assistant' | 'user'")]
  pub role: String,
  pub content: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub attachments: Option<Vec<Value>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[napi(ts_type = "Record<string, any>")]
  pub params: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub response_format: Option<PromptStructuredResponseContract>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, JsonSchema)]
#[serde(rename_all = "camelCase")]
pub struct PromptStructuredResponseContract {
  #[napi(ts_type = "'json_schema'")]
  pub r#type: String,
  #[napi(ts_type = "Record<string, unknown>")]
  pub response_schema_json: Value,
  pub schema_hash: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub strict: Option<bool>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct ToolContract {
  pub name: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub description: Option<String>,
  pub parameters: Value,
}

impl From<ToolContract> for CoreToolDefinition {
  fn from(tool: ToolContract) -> Self {
    Self {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }
  }
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ProviderDriverSpec {
  pub driver_id: String,
  pub provider_type: String,
  pub models: Vec<String>,
  pub routes: Vec<ProviderRouteSpec>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub host_only: Option<ProviderHostOnlySpec>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ProviderRouteSpec {
  pub kind: String,
  pub protocol: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub request_layer: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub supports_native_fallback: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub supports_tool_loop: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub request_middlewares: Option<Vec<String>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub stream_middlewares: Option<Vec<String>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub node_text_middlewares: Option<Vec<String>>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ProviderHostOnlySpec {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error_mapper: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub structured_retry: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub provider_tool_alias: Option<bool>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ModelConditionsContract {
  #[napi(ts_type = "Array<'text' | 'image' | 'audio' | 'file'>")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub input_types: Option<Vec<String>>,
  #[napi(ts_type = "Array<'image' | 'audio' | 'file'>")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub attachment_kinds: Option<Vec<String>>,
  #[napi(ts_type = "Array<'url' | 'data' | 'bytes' | 'file_handle'>")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub attachment_source_kinds: Option<Vec<String>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub has_remote_attachments: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub model_id: Option<String>,
  #[napi(ts_type = "'text' | 'image' | 'object' | 'structured' | 'embedding' | 'rerank'")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub output_type: Option<String>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct CapabilityAttachmentContract {
  #[napi(ts_type = "Array<'image' | 'audio' | 'file'>")]
  pub kinds: Vec<String>,
  #[napi(ts_type = "Array<'url' | 'data' | 'bytes' | 'file_handle'>")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub source_kinds: Option<Vec<String>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub allow_remote_urls: Option<bool>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct CapabilityModelCapability {
  #[napi(ts_type = "Array<'text' | 'image' | 'audio' | 'file'>")]
  pub input: Vec<String>,
  #[napi(ts_type = "Array<'text' | 'image' | 'object' | 'structured' | 'embedding' | 'rerank'>")]
  pub output: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub attachments: Option<CapabilityAttachmentContract>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub structured_attachments: Option<CapabilityAttachmentContract>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub default_for_output_type: Option<bool>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CapabilityModelContract {
  pub id: String,
  pub capabilities: Vec<CapabilityModelCapability>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CapabilityMatchRequest {
  pub models: Vec<CapabilityModelContract>,
  pub cond: ModelConditionsContract,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct CapabilityMatchResponse {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub model_id: Option<String>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct RequestedModelMatchRequest {
  pub provider_ids: Vec<String>,
  pub optional_models: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub requested_model_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub default_model: Option<String>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct RequestedModelMatchResponse {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub selected_model: Option<String>,
  pub matched_optional_model: bool,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ModelRegistryResolveRequest {
  #[napi(
    ts_type = "'openai_chat' | 'openai_responses' | 'anthropic' | 'cloudflare_workers_ai' | 'gemini_api' | \
               'gemini_vertex' | 'fal' | 'anthropic_vertex' | 'deepseek' | 'kimi' | 'opencode_go' | 'opencode_zen'"
  )]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub backend_kind: Option<String>,
  pub model_id: String,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ModelRegistryMatchRequest {
  #[napi(
    ts_type = "'openai_chat' | 'openai_responses' | 'anthropic' | 'cloudflare_workers_ai' | 'gemini_api' | \
               'gemini_vertex' | 'fal' | 'anthropic_vertex' | 'deepseek' | 'kimi' | 'opencode_go' | 'opencode_zen'"
  )]
  pub backend_kind: String,
  pub cond: ModelConditionsContract,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ModelRegistryVariantContract {
  #[napi(
    ts_type = "'openai_chat' | 'openai_responses' | 'anthropic' | 'cloudflare_workers_ai' | 'gemini_api' | \
               'gemini_vertex' | 'fal' | 'anthropic_vertex' | 'deepseek' | 'kimi' | 'opencode_go' | 'opencode_zen'"
  )]
  pub backend_kind: String,
  pub canonical_key: String,
  pub raw_model_id: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub display_name: Option<String>,
  pub aliases: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub legacy_aliases: Option<Vec<String>>,
  pub capabilities: Vec<CapabilityModelCapability>,
  #[napi(ts_type = "'openai_chat' | 'openai_responses' | 'openai_images' | 'anthropic' | 'gemini' | 'fal_image'")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub protocol: Option<String>,
  #[napi(
    ts_type = "'anthropic' | 'chat_completions' | 'chat_completions_no_v1' | 'cloudflare_workers_ai' | 'responses' | \
               'openai_images' | 'fal' | 'vertex' | 'vertex_anthropic' | 'gemini_api' | 'gemini_vertex'"
  )]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub request_layer: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub route_overrides: Option<BTreeMap<String, ModelRegistryRouteContract>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub behavior_flags: Option<Vec<String>>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ModelRegistryRouteContract {
  #[napi(ts_type = "'openai_chat' | 'openai_responses' | 'openai_images' | 'anthropic' | 'gemini' | 'fal_image'")]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub protocol: Option<String>,
  #[napi(
    ts_type = "'anthropic' | 'chat_completions' | 'chat_completions_no_v1' | 'cloudflare_workers_ai' | 'responses' | \
               'openai_images' | 'fal' | 'vertex' | 'vertex_anthropic' | 'gemini_api' | 'gemini_vertex'"
  )]
  #[serde(skip_serializing_if = "Option::is_none")]
  pub request_layer: Option<String>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
pub struct ModelRegistryResolveResponse {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub variant: Option<ModelRegistryVariantContract>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub matched_by: Option<String>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, JsonSchema, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ModelRegistryMatchResponse {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub variant: Option<ModelRegistryVariantContract>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalChatRequestContract {
  pub model: String,
  pub messages: Vec<PromptMessageContract>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub max_tokens: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub temperature: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub tools: Option<Vec<ToolContract>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub include: Option<Vec<String>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reasoning: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub response_schema: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub attachment_capability: Option<CapabilityAttachmentContract>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub middleware: Option<Value>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CanonicalStructuredRequestContract {
  pub model: String,
  pub messages: Vec<PromptMessageContract>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub schema: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub max_tokens: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub temperature: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reasoning: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub strict: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub response_mime_type: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub attachment_capability: Option<CapabilityAttachmentContract>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub middleware: Option<Value>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct RerankCandidate {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub id: Option<String>,
  pub text: String,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LlmRequestContract {
  pub model: String,
  pub messages: Vec<LlmCoreMessage>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub stream: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub max_tokens: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub temperature: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub tools: Option<Vec<ToolContract>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub tool_choice: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub include: Option<Vec<String>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reasoning: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub response_schema: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub middleware: Option<Value>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct LlmCoreMessage {
  pub role: String,
  pub content: Vec<Value>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LlmStructuredRequestContract {
  pub model: String,
  pub messages: Vec<LlmCoreMessage>,
  pub schema: Value,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub max_tokens: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub temperature: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub reasoning: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub strict: Option<bool>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub response_mime_type: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub middleware: Option<Value>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LlmEmbeddingRequestContract {
  pub model: String,
  pub inputs: Vec<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub dimensions: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub task_type: Option<String>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LlmRerankRequestContract {
  pub model: String,
  pub query: String,
  pub candidates: Vec<RerankCandidate>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub top_n: Option<u32>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct LlmImageOptionsContract {
  #[serde(skip_serializing_if = "Option::is_none")]
  pub n: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub size: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[serde(alias = "aspectRatio")]
  pub aspect_ratio: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub quality: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[serde(alias = "outputFormat")]
  #[napi(ts_type = "'png' | 'jpeg' | 'webp'")]
  pub output_format: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[serde(alias = "outputCompression")]
  pub output_compression: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub background: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub seed: Option<i64>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct LlmImageInputContract {
  #[napi(ts_type = "'url' | 'data' | 'bytes'")]
  pub kind: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub url: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[serde(alias = "dataBase64")]
  pub data_base64: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub data: Option<Vec<u8>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[serde(alias = "mediaType")]
  pub media_type: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[serde(alias = "fileName")]
  pub file_name: Option<String>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct LlmImageProviderOptionsContract {
  #[napi(ts_type = "'openai' | 'gemini' | 'fal' | 'extra'")]
  pub provider: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[napi(ts_type = "{
      input_fidelity?: string;
      response_modalities?: string[];
      model_name?: string;
      image_size?: unknown;
      aspect_ratio?: string;
      num_images?: number;
      enable_safety_checker?: boolean;
      output_format?: 'jpeg' | 'png' | 'webp';
      sync_mode?: boolean;
      enable_prompt_expansion?: boolean;
      loras?: unknown;
      controlnets?: unknown;
      extra?: unknown;
    } | unknown")]
  pub options: Option<Value>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct LlmImageRequestContract {
  pub model: String,
  pub prompt: String,
  #[napi(ts_type = "'generate' | 'edit'")]
  pub operation: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub images: Option<Vec<LlmImageInputContract>>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub mask: Option<LlmImageInputContract>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub options: Option<LlmImageOptionsContract>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[serde(alias = "providerOptions")]
  pub provider_options: Option<LlmImageProviderOptionsContract>,
}

#[napi(object)]
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LlmImageRequestBuildContract {
  pub model: String,
  #[napi(ts_type = "'openai_chat' | 'openai_responses' | 'openai_images' | 'anthropic' | 'gemini' | 'fal_image'")]
  pub protocol: String,
  pub messages: Vec<PromptMessageContract>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub options: Option<Value>,
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::{CapabilityMatchRequest, PromptRenderContract, PromptSessionContract, ProviderDriverSpec};

  #[test]
  fn should_roundtrip_prompt_contracts() {
    let render_value = json!({
      "messages": [{
        "role": "system",
        "content": "summarize",
        "responseFormat": {
          "type": "json_schema",
          "responseSchemaJson": {
            "type": "object",
            "properties": {
              "summary": { "type": "string" }
            },
            "required": ["summary"]
          },
          "schemaHash": "abc123"
        }
      }],
      "templateParams": { "tone": "short" },
      "renderParams": { "topic": "docs" }
    });
    let session_value = json!({
      "prompt": {
        "model": "gpt-5-mini",
        "promptTokens": 12,
        "templateParams": {},
        "messages": [{ "role": "system", "content": "summarize" }]
      },
      "turns": [{ "role": "user", "content": "hello" }],
      "renderParams": { "tone": "short" },
      "maxTokenSize": 1024
    });

    let render_contract: PromptRenderContract = serde_json::from_value(render_value.clone()).unwrap();
    let session_contract: PromptSessionContract = serde_json::from_value(session_value.clone()).unwrap();

    assert_eq!(serde_json::to_value(render_contract).unwrap(), render_value);
    assert_eq!(serde_json::to_value(session_contract).unwrap(), session_value);
  }

  #[test]
  fn should_roundtrip_tool_and_runtime_contracts() {
    let result_value = json!({
      "callId": "call-1",
      "name": "doc_read",
      "args": { "docId": "a1" },
      "output": { "markdown": "# title" }
    });
    let event_value = json!({
      "type": "tool_result",
      "call_id": "call-1",
      "name": "doc_read",
      "arguments": { "docId": "a1" },
      "output": { "markdown": "# title" }
    });
    let spec_value = json!({
      "driverId": "openai-default",
      "providerType": "openai",
      "models": ["gpt-5-mini"],
      "routes": [{
        "kind": "text",
        "protocol": "openai_chat",
        "supportsNativeFallback": true
      }]
    });

    let result: llm_runtime::ToolCallbackResponse = serde_json::from_value(result_value.clone()).unwrap();
    let event: llm_runtime::ToolLoopEvent = serde_json::from_value(event_value.clone()).unwrap();
    let spec: ProviderDriverSpec = serde_json::from_value(spec_value.clone()).unwrap();

    assert_eq!(serde_json::to_value(result).unwrap(), result_value);
    assert_eq!(serde_json::to_value(event).unwrap(), event_value);
    assert_eq!(serde_json::to_value(spec).unwrap(), spec_value);
  }

  #[test]
  fn should_roundtrip_capability_match_contracts() {
    let value = json!({
      "models": [{
        "id": "structured-file",
        "capabilities": [{
          "input": ["text", "file"],
          "output": ["structured"],
          "structuredAttachments": {
            "kinds": ["file"],
            "sourceKinds": ["file_handle"],
            "allowRemoteUrls": false
          },
          "defaultForOutputType": true
        }]
      }],
      "cond": {
        "modelId": "structured-file",
        "outputType": "structured",
        "inputTypes": ["text", "file"],
        "attachmentKinds": ["file"],
        "attachmentSourceKinds": ["file_handle"],
        "hasRemoteAttachments": false
      }
    });

    let contract: CapabilityMatchRequest = serde_json::from_value(value.clone()).unwrap();
    assert_eq!(serde_json::to_value(contract).unwrap(), value);
  }
}
