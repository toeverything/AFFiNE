import serverNativeModule, {
  type ActionEvent as NativeActionEventContract,
  type ActionRuntimeInput as NativeActionRuntimeInputContract,
  type AssertSafeUrlRequest,
  type BuiltInPromptRenderContract,
  type BuiltInPromptSessionContract,
  type BuiltInPromptSpec,
  type CanonicalChatRequestContract,
  type CanonicalStructuredRequestContract,
  type CapabilityAttachmentContract,
  type CapabilityModelCapability,
  type ImageInspection,
  type ImageInspectionOptions,
  type LlmCoreMessage,
  type LlmEmbeddingRequestContract,
  type LlmImageRequestContract,
  type LlmRequestContract,
  type LlmRerankRequestContract,
  type LlmStructuredRequestContract,
  type ModelConditionsContract,
  type ModelRegistryMatchResponse,
  type ModelRegistryResolveResponse,
  type PromptMessageContract,
  type PromptMetadataContract,
  type PromptMetadataResult,
  type PromptRenderContract,
  type PromptRenderResult,
  type PromptSessionContract,
  type PromptSessionResult,
  type PromptStructuredResponseContract,
  type PromptTokenCountContract,
  type PromptTokenCountResult,
  type RemoteAttachmentFetchRequest,
  type RemoteAttachmentFetchResponse,
  type RemoteMimeTypeRequest,
  type RequestedModelMatchResponse,
  type SafeFetchRequest,
  type SafeFetchResponse,
  type Tokenizer,
} from '@affine/server-native';

export type {
  AssertSafeUrlRequest,
  CapabilityAttachmentContract,
  CapabilityModelCapability,
  ImageInspection,
  ImageInspectionOptions,
  ModelConditionsContract,
  PromptMessageContract,
  PromptStructuredResponseContract,
  RemoteAttachmentFetchRequest,
  RemoteAttachmentFetchResponse,
  RemoteMimeTypeRequest,
  SafeFetchRequest,
  SafeFetchResponse,
};

export type ActionEventType =
  | 'action_start'
  | 'step_start'
  | 'attachment'
  | 'step_end'
  | 'action_done'
  | 'error';

export type ActionRunStatus =
  | 'created'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'aborted';

export type NativeActionEvent = Omit<
  NativeActionEventContract,
  'type' | 'status'
> & {
  type: ActionEventType;
  status?: ActionRunStatus;
};

export type NativeActionRuntimeInput = Omit<
  NativeActionRuntimeInputContract,
  'input'
> & {
  input?: unknown;
};

import type {
  CopilotProviderModel,
  ModelFullConditions,
} from './plugins/copilot/providers/types';
import type { CopilotModelBackendKind } from './plugins/copilot/runtime/contracts';
import { parseToolLoopStreamEvent } from './plugins/copilot/runtime/contracts/shared';
import type {
  ToolCallRequest,
  ToolCallResult,
} from './plugins/copilot/runtime/contracts/tool-contract';

export const mergeUpdatesInApplyWay = serverNativeModule.mergeUpdatesInApplyWay;

export const verifyChallengeResponse = async (
  response: any,
  bits: number,
  resource: string
) => {
  if (typeof response !== 'string' || !response || !resource) return false;
  return serverNativeModule.verifyChallengeResponse(response, bits, resource);
};

export const mintChallengeResponse = async (resource: string, bits: number) => {
  if (!resource) return null;
  return serverNativeModule.mintChallengeResponse(resource, bits);
};

const ENCODER_CACHE = new Map<string, Tokenizer>();

export function getTokenEncoder(model?: string | null): Tokenizer | null {
  if (!model) return null;
  const cached = ENCODER_CACHE.get(model);
  if (cached) return cached;
  if (model.startsWith('gpt')) {
    const encoder = serverNativeModule.fromModelName(model);
    if (encoder) ENCODER_CACHE.set(model, encoder);
    return encoder;
  } else if (model.startsWith('dall')) {
    // dalle don't need to calc the token
    return null;
  } else {
    // c100k based model
    const encoder = serverNativeModule.fromModelName('gpt-4');
    if (encoder) ENCODER_CACHE.set('gpt-4', encoder);
    return encoder;
  }
}

export const getMime = serverNativeModule.getMime;
export const inspectImageForProxy = serverNativeModule.inspectImageForProxy;
export const fetchRemoteAttachment = serverNativeModule.fetchRemoteAttachment;
export const inferRemoteMimeType = serverNativeModule.inferRemoteMimeType;
export const assertSafeUrl = serverNativeModule.assertSafeUrl;
export const safeFetch = serverNativeModule.safeFetch;
export const parseDoc = serverNativeModule.parseDoc;
export const htmlSanitize = serverNativeModule.htmlSanitize;
export const processImage = serverNativeModule.processImage;
export const parseYDocFromBinary = serverNativeModule.parseDocFromBinary;
export const parseYDocToMarkdown = serverNativeModule.parseDocToMarkdown;
export const parsePageDocFromBinary = serverNativeModule.parsePageDoc;
export const parseWorkspaceDocFromBinary = serverNativeModule.parseWorkspaceDoc;
export const readAllDocIdsFromRootDoc =
  serverNativeModule.readAllDocIdsFromRootDoc;
export const AFFINE_PRO_PUBLIC_KEY = serverNativeModule.AFFINE_PRO_PUBLIC_KEY;
export const AFFINE_PRO_LICENSE_AES_KEY =
  serverNativeModule.AFFINE_PRO_LICENSE_AES_KEY;

// MCP write tools exports
export const createDocWithMarkdown = serverNativeModule.createDocWithMarkdown;
export const updateDocWithMarkdown = serverNativeModule.updateDocWithMarkdown;
export const addDocToRootDoc = serverNativeModule.addDocToRootDoc;
export const buildPublicRootDoc = serverNativeModule.buildPublicRootDoc;
export const updateDocTitle = serverNativeModule.updateDocTitle;
export const updateDocProperties = serverNativeModule.updateDocProperties;
export const updateRootDocMetaTitle = serverNativeModule.updateRootDocMetaTitle;

const nativeLlmModule = serverNativeModule;

export type LlmProtocol =
  | 'openai_chat'
  | 'openai_responses'
  | 'openai_images'
  | 'anthropic'
  | 'gemini'
  | 'fal_image';

type LlmAttachmentReferenceMode = 'remote' | 'inline';

type LlmAttachmentReferenceReason =
  | 'non_url_source'
  | 'unsupported_scheme'
  | 'generic_remote_reference'
  | 'gemini_api_file_uri'
  | 'gemini_api_youtube_url'
  | 'gemini_api_inline_http_url';

type LlmAttachmentReferencePlan = {
  mode: LlmAttachmentReferenceMode;
  reason: LlmAttachmentReferenceReason;
};

type LlmRequestIntentReasoning = {
  enabled?: boolean;
  effort?: 'low' | 'medium' | 'high';
  budget_tokens?: number;
  include_reasoning?: boolean;
};

type LlmRequestIntent = {
  include?: string[];
  reasoning?: LlmRequestIntentReasoning;
};

type LlmResolvedRequestIntent = {
  include?: string[];
  reasoning?: Record<string, unknown>;
};

export type NativePromptMessageInput = Omit<
  PromptMessageContract,
  'role' | 'attachments' | 'params' | 'responseFormat'
> & {
  role: 'system' | 'user' | 'assistant';
  attachments?: Array<
    | string
    | {
        attachment: string;
        mimeType?: string;
      }
    | {
        kind: 'url';
        url: string;
        data?: string;
        encoding?: 'base64';
        mimeType?: string;
        fileName?: string;
        providerHint?: {
          provider?: string;
          kind?: 'image' | 'audio' | 'file';
        };
      }
    | {
        kind: 'data';
        data: string;
        mimeType: string;
        encoding?: 'base64' | 'utf8';
        fileName?: string;
        providerHint?: {
          provider?: string;
          kind?: 'image' | 'audio' | 'file';
        };
      }
    | {
        kind: 'bytes';
        data: string;
        mimeType: string;
        encoding?: 'base64';
        fileName?: string;
        providerHint?: {
          provider?: string;
          kind?: 'image' | 'audio' | 'file';
        };
      }
    | {
        kind: 'file_handle';
        fileHandle: string;
        mimeType?: string;
        fileName?: string;
        providerHint?: {
          provider?: string;
          kind?: 'image' | 'audio' | 'file';
        };
      }
  >;
  params?: Record<string, unknown>;
  responseFormat?: Omit<
    PromptStructuredResponseContract,
    'responseSchemaJson'
  > & {
    responseSchemaJson: Record<string, unknown>;
  };
};

export type LlmBackendConfig = {
  base_url: string;
  auth_token: string;
  request_layer?:
    | 'anthropic'
    | 'chat_completions'
    | 'cloudflare_workers_ai'
    | 'responses'
    | 'openai_images'
    | 'fal'
    | 'vertex'
    | 'vertex_anthropic'
    | 'gemini_api'
    | 'gemini_vertex';
  headers?: Record<string, string>;
  no_streaming?: boolean;
  timeout_ms?: number;
};

export type LlmRoutedBackend = {
  provider_id: string;
  protocol: LlmProtocol;
  model: string;
  config: LlmBackendConfig;
};

export type LlmPreparedDispatchRoute = LlmRoutedBackend & {
  request: LlmRequest;
};

export type LlmPreparedStructuredDispatchRoute = LlmRoutedBackend & {
  request: LlmStructuredRequest;
};

export type LlmPreparedEmbeddingDispatchRoute = LlmRoutedBackend & {
  request: LlmEmbeddingRequestContract;
};

export type LlmPreparedRerankDispatchRoute = LlmRoutedBackend & {
  request: LlmRerankRequestContract;
};

export type LlmImageRequest = LlmImageRequestContract;

export type LlmImageRequestBuildInput = {
  model: string;
  protocol: LlmProtocol;
  messages: PromptMessageContract[];
  options?: {
    quality?: string;
    seed?: number;
    modelName?: string | null;
    loras?: unknown;
  };
};

export type LlmPreparedImageDispatchRoute = LlmRoutedBackend & {
  request: LlmImageRequest;
};

export type LlmRequest = Omit<
  LlmRequestContract,
  | 'messages'
  | 'tools'
  | 'toolChoice'
  | 'reasoning'
  | 'responseSchema'
  | 'middleware'
> & {
  messages: LlmCoreMessage[];
  tools?: Array<{
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  }>;
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  reasoning?: Record<string, unknown>;
  responseSchema?: Record<string, unknown>;
  middleware?: {
    request?: Array<
      | 'normalize_messages'
      | 'clamp_max_tokens'
      | 'tool_schema_rewrite'
      | 'openai_request_compat'
    >;
    stream?: Array<'stream_event_normalize' | 'citation_indexing'>;
    config?: {
      additional_properties_policy?: 'preserve' | 'forbid';
      property_format_policy?: 'preserve' | 'drop';
      property_min_length_policy?: 'preserve' | 'drop';
      array_min_items_policy?: 'preserve' | 'drop';
      array_max_items_policy?: 'preserve' | 'drop';
      max_tokens_cap?: number;
    };
  };
};

export type LlmStructuredRequest = Omit<
  LlmStructuredRequestContract,
  'messages' | 'schema' | 'reasoning' | 'middleware'
> & {
  messages: LlmCoreMessage[];
  schema: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  middleware?: LlmRequest['middleware'];
};

class StructuredResponseParseError extends Error {
  readonly code = 'invalid_structured_output' as const;

  constructor(message: string) {
    super(message);
    this.name = 'StructuredResponseParseError';
  }
}

export type LlmDispatchResponse = {
  id: string;
  model: string;
  message: LlmCoreMessage;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cached_tokens?: number;
  };
  finish_reason:
    | 'stop'
    | 'length'
    | 'tool_calls'
    | 'content_filter'
    | 'error'
    | string;
  reasoning_details?: unknown;
};

type LlmDispatchResult = {
  provider_id: string;
  response: LlmDispatchResponse;
};

type LlmRoutedDispatchResult<TResponse> = {
  provider_id: string;
  response: TResponse;
};

export type LlmStructuredResponse = {
  id: string;
  model: string;
  output_text: string;
  output_json?: unknown;
  usage: LlmDispatchResponse['usage'];
  finish_reason: LlmDispatchResponse['finish_reason'];
  reasoning_details?: unknown;
};

class StructuredDispatchError extends Error {
  constructor(
    readonly code: 'invalid_structured_output',
    message: string,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'StructuredDispatchError';
  }
}

const INVALID_STRUCTURED_OUTPUT_PREFIX = 'invalid_structured_output:';

export function isInvalidStructuredOutputError(
  error: unknown
): error is { code: 'invalid_structured_output' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'invalid_structured_output'
  );
}

function mapStructuredDispatchError(error: unknown): never {
  const message =
    error instanceof Error ? error.message : String(error ?? 'Unknown error');

  if (message.startsWith(INVALID_STRUCTURED_OUTPUT_PREFIX)) {
    throw new StructuredDispatchError(
      'invalid_structured_output',
      message.slice(INVALID_STRUCTURED_OUTPUT_PREFIX.length).trim(),
      error
    );
  }

  throw error;
}

type LlmEmbeddingResponse = {
  model: string;
  embeddings: number[][];
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
};

type LlmRerankResponse = {
  model: string;
  scores: number[];
};

export type LlmToolLoopStreamEvent =
  | { type: 'message_start'; id?: string; model?: string }
  | { type: 'provider_selected'; provider_id: string }
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | {
      type: 'tool_call';
      call_id: string;
      name: string;
      arguments: Record<string, unknown>;
      arguments_text?: string;
      arguments_error?: string;
      thought?: string;
    }
  | {
      type: 'tool_result';
      call_id: string;
      output: unknown;
      is_error?: boolean;
      name: string;
      arguments: Record<string, unknown>;
      arguments_text?: string;
      arguments_error?: string;
    }
  | { type: 'citation'; index: number; url: string }
  | {
      type: 'usage';
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        cached_tokens?: number;
      };
    }
  | {
      type: 'done';
      finish_reason?: LlmDispatchResponse['finish_reason'];
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        cached_tokens?: number;
      };
    }
  | { type: 'error'; message: string; code?: string; raw?: string };

type LlmStreamEvent =
  | LlmToolLoopStreamEvent
  | {
      type: 'tool_call_delta';
      call_id: string;
      name?: string;
      arguments_delta: string;
    };
export type LlmToolCallbackRequest = ToolCallRequest;
export type LlmToolCallbackResponse = ToolCallResult;

const LLM_STREAM_END_MARKER = '__AFFINE_LLM_STREAM_END__';

async function callLlmToolCallback(
  requestJson: string,
  toolCallback: (
    request: LlmToolCallbackRequest
  ) => LlmToolCallbackResponse | Promise<LlmToolCallbackResponse>
) {
  const request = llmValidateContract<ToolCallRequest>(
    'toolCallbackRequest',
    JSON.parse(requestJson)
  );
  const response = await toolCallback(request);
  return JSON.stringify(
    llmValidateContract<ToolCallResult>('toolCallbackResponse', response)
  );
}

function parseLlmEventJson(eventJson: string): LlmStreamEvent {
  return JSON.parse(eventJson) as LlmStreamEvent;
}

function parseLlmToolLoopStreamEvent(
  eventJson: string
): LlmToolLoopStreamEvent {
  const event = parseLlmEventJson(eventJson);
  if (
    event.type === 'provider_selected' &&
    typeof event.provider_id === 'string'
  ) {
    return event;
  }
  return parseToolLoopStreamEvent(event);
}

export function llmMatchModelCapabilities(
  models: CopilotProviderModel[],
  cond: ModelFullConditions
): string | undefined {
  if (!nativeLlmModule.llmMatchModelCapabilities) {
    throw new Error('native llm capability matcher is not available');
  }

  const response = nativeLlmModule.llmMatchModelCapabilities({
    models,
    cond,
  });

  return response.modelId ?? undefined;
}

export function llmResolveModelRegistryVariant(input: {
  backendKind?: CopilotModelBackendKind;
  modelId: string;
}): ModelRegistryResolveResponse {
  if (!nativeLlmModule.llmResolveModelRegistryVariant) {
    throw new Error('native model registry resolver is not available');
  }

  return nativeLlmModule.llmResolveModelRegistryVariant(input);
}

export function llmMatchModelRegistry(input: {
  backendKind: CopilotModelBackendKind;
  cond: ModelFullConditions;
}): ModelRegistryMatchResponse {
  if (!nativeLlmModule.llmMatchModelRegistry) {
    throw new Error('native model registry matcher is not available');
  }

  return nativeLlmModule.llmMatchModelRegistry(input);
}

export function llmInferPromptModelConditions(
  messages: NativePromptMessageInput[]
): ModelConditionsContract {
  if (!nativeLlmModule.llmInferPromptModelConditions) {
    throw new Error('native prompt model condition inference is not available');
  }

  return nativeLlmModule.llmInferPromptModelConditions(messages);
}

export function llmResolveRequestedModelMatch(input: {
  providerIds: string[];
  optionalModels: string[];
  requestedModelId?: string;
  defaultModel?: string;
}): RequestedModelMatchResponse {
  if (!nativeLlmModule.llmResolveRequestedModelMatch) {
    throw new Error('native requested model matcher is not available');
  }

  return nativeLlmModule.llmResolveRequestedModelMatch(input);
}

async function llmDispatchPrepared(
  routes: LlmPreparedDispatchRoute[]
): Promise<LlmDispatchResult> {
  if (!nativeLlmModule.llmDispatchPrepared) {
    throw new Error('native prepared llm dispatch is not available');
  }
  const response = nativeLlmModule.llmDispatchPrepared(JSON.stringify(routes));
  const responseText = await Promise.resolve(response);
  return JSON.parse(responseText) as LlmDispatchResult;
}

type LlmChatDispatchPlanInput = {
  preparedRoutes: LlmPreparedDispatchRoute[];
};

export async function llmDispatchPlan(
  input: LlmChatDispatchPlanInput
): Promise<{
  provider_id: string;
  response: LlmDispatchResponse;
}> {
  return await llmDispatchPrepared(input.preparedRoutes);
}

export async function llmStructuredDispatch(
  protocol: LlmProtocol,
  backendConfig: LlmBackendConfig,
  request: LlmStructuredRequest
): Promise<LlmStructuredResponse> {
  if (!nativeLlmModule.llmStructuredDispatch) {
    throw new Error('native llm structured dispatch is not available');
  }
  try {
    const response = nativeLlmModule.llmStructuredDispatch(
      protocol,
      JSON.stringify(backendConfig),
      JSON.stringify(request)
    );
    const responseText = await Promise.resolve(response);
    return JSON.parse(responseText) as LlmStructuredResponse;
  } catch (error) {
    mapStructuredDispatchError(error);
  }
}

async function llmStructuredDispatchPrepared(
  routes: LlmPreparedStructuredDispatchRoute[]
): Promise<LlmRoutedDispatchResult<LlmStructuredResponse>> {
  if (!nativeLlmModule.llmStructuredDispatchPrepared) {
    throw new Error('native prepared structured dispatch is not available');
  }
  try {
    const response = nativeLlmModule.llmStructuredDispatchPrepared(
      JSON.stringify(routes)
    );
    const responseText = await Promise.resolve(response);
    return JSON.parse(
      responseText
    ) as LlmRoutedDispatchResult<LlmStructuredResponse>;
  } catch (error) {
    mapStructuredDispatchError(error);
  }
}

type LlmStructuredDispatchPlanInput = {
  preparedRoutes: LlmPreparedStructuredDispatchRoute[];
};

export async function llmStructuredDispatchPlan(
  input: LlmStructuredDispatchPlanInput
): Promise<{
  provider_id: string;
  response: LlmStructuredResponse;
}> {
  return await llmStructuredDispatchPrepared(input.preparedRoutes);
}

export async function llmEmbeddingDispatch(
  protocol: LlmProtocol,
  backendConfig: LlmBackendConfig,
  request: LlmEmbeddingRequestContract
): Promise<{
  model: string;
  embeddings: number[][];
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}> {
  if (!nativeLlmModule.llmEmbeddingDispatch) {
    throw new Error('native llm embedding dispatch is not available');
  }
  const response = nativeLlmModule.llmEmbeddingDispatch(
    protocol,
    JSON.stringify(backendConfig),
    JSON.stringify(request)
  );
  const responseText = await Promise.resolve(response);
  return JSON.parse(responseText) as LlmEmbeddingResponse;
}

async function llmEmbeddingDispatchPrepared(
  routes: LlmPreparedEmbeddingDispatchRoute[]
): Promise<LlmRoutedDispatchResult<LlmEmbeddingResponse>> {
  if (!nativeLlmModule.llmEmbeddingDispatchPrepared) {
    throw new Error('native prepared embedding dispatch is not available');
  }
  const response = nativeLlmModule.llmEmbeddingDispatchPrepared(
    JSON.stringify(routes)
  );
  const responseText = await Promise.resolve(response);
  return JSON.parse(
    responseText
  ) as LlmRoutedDispatchResult<LlmEmbeddingResponse>;
}

type LlmEmbeddingDispatchPlanInput = {
  preparedRoutes: LlmPreparedEmbeddingDispatchRoute[];
};

export async function llmEmbeddingDispatchPlan(
  input: LlmEmbeddingDispatchPlanInput
): Promise<{
  provider_id: string;
  response: {
    model: string;
    embeddings: number[][];
    usage?: {
      prompt_tokens: number;
      total_tokens: number;
    };
  };
}> {
  return await llmEmbeddingDispatchPrepared(input.preparedRoutes);
}

export async function llmRerankDispatch(
  protocol: LlmProtocol,
  backendConfig: LlmBackendConfig,
  request: LlmRerankRequestContract
): Promise<{
  model: string;
  scores: number[];
}> {
  if (!nativeLlmModule.llmRerankDispatch) {
    throw new Error('native llm rerank dispatch is not available');
  }
  const response = nativeLlmModule.llmRerankDispatch(
    protocol,
    JSON.stringify(backendConfig),
    JSON.stringify(request)
  );
  const responseText = await Promise.resolve(response);
  return JSON.parse(responseText) as LlmRerankResponse;
}

async function llmRerankDispatchPrepared(
  routes: LlmPreparedRerankDispatchRoute[]
): Promise<LlmRoutedDispatchResult<LlmRerankResponse>> {
  if (!nativeLlmModule.llmRerankDispatchPrepared) {
    throw new Error('native prepared llm rerank dispatch is not available');
  }
  const response = nativeLlmModule.llmRerankDispatchPrepared(
    JSON.stringify(routes)
  );
  const responseText = await Promise.resolve(response);
  return JSON.parse(responseText) as LlmRoutedDispatchResult<LlmRerankResponse>;
}

type LlmRerankDispatchPlanInput = {
  preparedRoutes: LlmPreparedRerankDispatchRoute[];
};

export async function llmRerankDispatchPlan(
  input: LlmRerankDispatchPlanInput
): Promise<{
  provider_id: string;
  response: {
    model: string;
    scores: number[];
  };
}> {
  return await llmRerankDispatchPrepared(input.preparedRoutes);
}

export type LlmImageResponse = {
  images: Array<{
    url?: string;
    data_base64?: string;
    media_type: string;
    width?: number;
    height?: number;
    provider_metadata?: unknown;
  }>;
  text?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  provider_metadata?: unknown;
};

export type LlmImageResponseContract = LlmImageResponse;

export function buildLlmImageRequestFromMessages(
  request: LlmImageRequestBuildInput
): LlmImageRequest {
  return nativeLlmModule.llmBuildImageRequestFromMessages(request);
}

async function llmImageDispatchPrepared(
  routes: LlmPreparedImageDispatchRoute[]
): Promise<LlmRoutedDispatchResult<LlmImageResponse>> {
  if (!nativeLlmModule.llmImageDispatchPrepared) {
    throw new Error('native prepared image dispatch is not available');
  }
  const response = nativeLlmModule.llmImageDispatchPrepared(
    JSON.stringify(routes)
  );
  const responseText = await Promise.resolve(response);
  return JSON.parse(responseText) as LlmRoutedDispatchResult<LlmImageResponse>;
}

export async function llmImageDispatchPlan(input: {
  preparedRoutes: LlmPreparedImageDispatchRoute[];
}): Promise<{
  provider_id: string;
  response: LlmImageResponse;
}> {
  return await llmImageDispatchPrepared(input.preparedRoutes);
}

export async function llmPlanAttachmentReference(
  protocol: LlmProtocol,
  backendConfig: LlmBackendConfig,
  source: Record<string, unknown> | string
): Promise<{
  mode: 'remote' | 'inline';
  reason:
    | 'non_url_source'
    | 'unsupported_scheme'
    | 'generic_remote_reference'
    | 'gemini_api_file_uri'
    | 'gemini_api_youtube_url'
    | 'gemini_api_inline_http_url';
}> {
  if (!nativeLlmModule.llmPlanAttachmentReference) {
    throw new Error('native attachment reference planning is not available');
  }
  const response = nativeLlmModule.llmPlanAttachmentReference(
    protocol,
    JSON.stringify(backendConfig),
    JSON.stringify(source)
  );
  const responseText = await Promise.resolve(response);
  return JSON.parse(responseText) as LlmAttachmentReferencePlan;
}

async function llmResolveRequestIntent(
  protocol: LlmProtocol,
  backendConfig: LlmBackendConfig,
  intent: LlmRequestIntent
): Promise<LlmResolvedRequestIntent> {
  if (!nativeLlmModule.llmResolveRequestIntent) {
    throw new Error('native request intent resolution is not available');
  }
  const response = nativeLlmModule.llmResolveRequestIntent(
    protocol,
    JSON.stringify(backendConfig),
    JSON.stringify(intent)
  );
  const responseText = await Promise.resolve(response);
  return JSON.parse(responseText) as LlmResolvedRequestIntent;
}

export async function llmResolveRequestIntentOptions({
  protocol,
  backendConfig,
  include,
  reasoning,
}: {
  protocol: LlmProtocol;
  backendConfig: LlmBackendConfig;
  include?: string[];
  reasoning?: {
    enabled?: boolean;
    supported?: boolean;
    effort?: 'low' | 'medium' | 'high';
    budgetTokens?: number;
    includeReasoning?: boolean;
  };
}): Promise<{
  include?: string[];
  reasoning?: Record<string, unknown>;
}> {
  const intent: LlmRequestIntent = {
    ...(include?.length ? { include } : {}),
    ...(reasoning?.enabled && reasoning.supported !== false
      ? {
          reasoning: {
            enabled: true,
            effort: reasoning.effort,
            budget_tokens: reasoning.budgetTokens,
            include_reasoning: reasoning.includeReasoning,
          },
        }
      : {}),
  };

  if (!intent.include?.length && !intent.reasoning) {
    return {};
  }

  return await llmResolveRequestIntent(protocol, backendConfig, intent);
}

export function llmRenderPrompt(
  request: PromptRenderContract
): PromptRenderResult {
  if (!nativeLlmModule.llmRenderPrompt) {
    throw new Error('native prompt render is not available');
  }
  return nativeLlmModule.llmRenderPrompt(request);
}

export function llmRenderBuiltInPrompt(
  request: BuiltInPromptRenderContract
): PromptRenderResult {
  if (!nativeLlmModule.llmRenderBuiltInPrompt) {
    throw new Error('native built-in prompt renderer is not available');
  }

  return nativeLlmModule.llmRenderBuiltInPrompt(request);
}

export function llmRenderSessionPrompt(
  request: PromptSessionContract
): PromptSessionResult {
  if (!nativeLlmModule.llmRenderSessionPrompt) {
    throw new Error('native session prompt render is not available');
  }
  return nativeLlmModule.llmRenderSessionPrompt(request);
}

export function llmRenderBuiltInSessionPrompt(
  request: BuiltInPromptSessionContract
): PromptSessionResult {
  if (!nativeLlmModule.llmRenderBuiltInSessionPrompt) {
    throw new Error('native built-in session prompt renderer is not available');
  }

  return nativeLlmModule.llmRenderBuiltInSessionPrompt(request);
}

export function llmCountPromptTokens(
  request: PromptTokenCountContract
): PromptTokenCountResult {
  if (!nativeLlmModule.llmCountPromptTokens) {
    throw new Error('native prompt token counting is not available');
  }
  return nativeLlmModule.llmCountPromptTokens(request);
}

export function llmCollectPromptMetadata(
  request: PromptMetadataContract
): PromptMetadataResult {
  if (!nativeLlmModule.llmCollectPromptMetadata) {
    throw new Error('native prompt metadata collection is not available');
  }
  return nativeLlmModule.llmCollectPromptMetadata(request);
}

export function llmListBuiltInPromptSpecs(): BuiltInPromptSpec[] {
  if (!nativeLlmModule.llmListBuiltInPromptSpecs) {
    throw new Error('native built-in prompt specs are not available');
  }
  return nativeLlmModule.llmListBuiltInPromptSpecs();
}

export function llmGetBuiltInPromptSpec(
  name: string
): BuiltInPromptSpec | null {
  if (!nativeLlmModule.llmGetBuiltInPromptSpec) {
    throw new Error('native built-in prompt spec lookup is not available');
  }
  return nativeLlmModule.llmGetBuiltInPromptSpec(name);
}

function stripLlmRequestMiddleware<
  T extends { middleware?: { request?: string[]; stream?: string[] } },
>(request: T): T {
  const middleware = request.middleware;
  if (!middleware) {
    return request;
  }

  const nextMiddleware = {
    ...(middleware.request?.length ? { request: middleware.request } : {}),
    ...(middleware.stream?.length ? { stream: middleware.stream } : {}),
  };
  if (Object.keys(nextMiddleware).length === 0) {
    const { middleware: _middleware, ...rest } = request;
    return rest as T;
  }

  return {
    ...request,
    middleware: nextMiddleware,
  };
}

export function llmBuildCanonicalRequest(
  request: CanonicalChatRequestContract
): LlmRequest {
  if (!nativeLlmModule.llmBuildCanonicalRequest) {
    throw new Error('native canonical request builder is not available');
  }
  return stripLlmRequestMiddleware(
    nativeLlmModule.llmBuildCanonicalRequest(request)
  );
}

export function llmBuildCanonicalStructuredRequest(
  request: CanonicalStructuredRequestContract
): LlmStructuredRequest {
  if (!nativeLlmModule.llmBuildCanonicalStructuredRequest) {
    throw new Error(
      'native canonical structured request builder is not available'
    );
  }
  return stripLlmRequestMiddleware(
    nativeLlmModule.llmBuildCanonicalStructuredRequest(request)
  );
}

function llmBuildEmbeddingRequest(
  request: LlmEmbeddingRequestContract
): LlmEmbeddingRequestContract {
  if (!nativeLlmModule.llmBuildEmbeddingRequest) {
    throw new Error('native embedding request builder is not available');
  }
  return nativeLlmModule.llmBuildEmbeddingRequest(request);
}

export function buildLlmEmbeddingRequest(input: {
  model: string;
  inputs: string[];
  dimensions?: number;
  taskType?: string;
}): LlmEmbeddingRequestContract {
  return llmBuildEmbeddingRequest({
    model: input.model,
    inputs: input.inputs,
    dimensions: input.dimensions,
    taskType: input.taskType,
  });
}

function llmBuildRerankRequest(
  request: LlmRerankRequestContract
): LlmRerankRequestContract {
  if (!nativeLlmModule.llmBuildRerankRequest) {
    throw new Error('native rerank request builder is not available');
  }
  return nativeLlmModule.llmBuildRerankRequest(request);
}

export function buildLlmRerankRequest(
  model: string,
  request: {
    query: string;
    candidates: Array<{ id?: string; text: string }>;
    topK?: number;
  }
): LlmRerankRequestContract {
  return llmBuildRerankRequest({
    model,
    query: request.query,
    candidates: request.candidates.map(candidate => ({
      ...(candidate.id ? { id: candidate.id } : {}),
      text: candidate.text,
    })),
    ...(request.topK ? { topN: request.topK } : {}),
  });
}

export function parseNativeStructuredOutput(
  response: Pick<LlmStructuredResponse, 'output_text'> & {
    output_json?: unknown;
  }
) {
  if (response.output_json === undefined) {
    throw new StructuredResponseParseError(
      `Structured response missing required output_json: ${response.output_text
        .trim()
        .slice(0, 200)}`
    );
  }

  return response.output_json;
}

export function llmValidateJsonSchema<T = unknown>(
  schema: Record<string, unknown>,
  value: T
): T {
  if (!nativeLlmModule.llmValidateJsonSchema) {
    throw new Error('native JSON schema validator is not available');
  }

  return nativeLlmModule.llmValidateJsonSchema(schema, value) as T;
}

export function llmCanonicalJsonSchemaHash(
  schema: Record<string, unknown>
): string {
  if (!nativeLlmModule.llmCanonicalJsonSchemaHash) {
    throw new Error(
      'native canonical JSON schema hash helper is not available'
    );
  }

  return nativeLlmModule.llmCanonicalJsonSchemaHash(schema);
}

export type LlmContractName =
  | 'executionPlan'
  | 'preparedRoutes'
  | 'promptRenderContract'
  | 'promptSessionContract'
  | 'toolCallbackRequest'
  | 'toolCallbackResponse'
  | 'toolLoopEvent'
  | 'transcriptInput'
  | 'transcriptGeneratedResult'
  | 'transcriptResult';

export function llmGetContractSchema(
  name: LlmContractName
): Record<string, unknown> {
  if (!nativeLlmModule.llmGetContractSchema) {
    throw new Error('native LLM contract schema registry is not available');
  }

  return nativeLlmModule.llmGetContractSchema(name) as Record<string, unknown>;
}

export function llmValidateContract<T = unknown>(
  name: LlmContractName,
  value: unknown
): T {
  if (!nativeLlmModule.llmValidateContract) {
    throw new Error('native LLM contract validator is not available');
  }

  return nativeLlmModule.llmValidateContract(name, value) as T;
}

export function llmCompileExecutionPlan<T = unknown>(value: unknown): T {
  if (!nativeLlmModule.llmCompileExecutionPlan) {
    throw new Error('native execution plan compiler is not available');
  }

  return nativeLlmModule.llmCompileExecutionPlan(value) as T;
}

export function llmNormalizePreparedRoutes<T = unknown>(value: unknown): T {
  if (!nativeLlmModule.llmNormalizePreparedRoutes) {
    throw new Error('native prepared route normalizer is not available');
  }

  return nativeLlmModule.llmNormalizePreparedRoutes(value) as T;
}

class NativeStreamAdapter<T> implements AsyncIterableIterator<T> {
  readonly #queue: T[] = [];
  readonly #waiters: ((result: IteratorResult<T>) => void)[] = [];
  readonly #handle: { abort?: () => void } | undefined;
  readonly #signal?: AbortSignal;
  readonly #abortListener?: () => void;
  #ended = false;

  constructor(
    handle: { abort?: () => void } | undefined,
    signal?: AbortSignal
  ) {
    this.#handle = handle;
    this.#signal = signal;

    if (signal?.aborted) {
      this.close(true);
      return;
    }

    if (signal) {
      this.#abortListener = () => {
        this.close(true);
      };
      signal.addEventListener('abort', this.#abortListener, { once: true });
    }
  }

  private close(abortHandle: boolean) {
    if (this.#ended) {
      return;
    }

    this.#ended = true;
    if (this.#signal && this.#abortListener) {
      this.#signal.removeEventListener('abort', this.#abortListener);
    }
    if (abortHandle) {
      this.#handle?.abort?.();
    }

    while (this.#waiters.length) {
      const waiter = this.#waiters.shift();
      waiter?.({ value: undefined as T, done: true });
    }
  }

  push(value: T | null) {
    if (this.#ended) {
      return;
    }

    if (value === null) {
      this.close(false);
      return;
    }

    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
      return;
    }

    this.#queue.push(value);
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.#queue.length > 0) {
      const value = this.#queue.shift() as T;
      return { value, done: false };
    }

    if (this.#ended) {
      return { value: undefined as T, done: true };
    }

    return await new Promise(resolve => {
      this.#waiters.push(resolve);
    });
  }

  async return(): Promise<IteratorResult<T>> {
    this.close(true);

    return { value: undefined as T, done: true };
  }
}

export function runNativeActionRecipePreparedStream(
  input: NativeActionRuntimeInput,
  signal?: AbortSignal
): AsyncIterableIterator<NativeActionEvent> {
  if (!nativeLlmModule.runNativeActionRecipePreparedStream) {
    throw new Error('native action recipe stream runtime is not available');
  }

  let adapter: NativeStreamAdapter<NativeActionEvent> | undefined;
  const buffer: (NativeActionEvent | null)[] = [];
  let pushFn = (event: NativeActionEvent | null) => {
    buffer.push(event);
  };
  const handle = nativeLlmModule.runNativeActionRecipePreparedStream(
    input as NativeActionRuntimeInputContract,
    (error, eventJson) => {
      if (error) {
        pushFn({
          type: 'error',
          actionId: input.recipeId,
          actionVersion: input.recipeVersion ?? '',
          errorCode: 'action_stream_callback_error',
          errorMessage: error.message,
        });
        return;
      }
      if (eventJson === LLM_STREAM_END_MARKER) {
        pushFn(null);
        return;
      }
      try {
        pushFn(JSON.parse(eventJson) as NativeActionEvent);
      } catch (error) {
        pushFn({
          type: 'error',
          actionId: input.recipeId,
          actionVersion: input.recipeVersion ?? '',
          errorCode: 'action_stream_event_parse_failed',
          errorMessage:
            error instanceof Error
              ? error.message
              : 'failed to parse native action stream event',
        });
      }
    }
  );
  adapter = new NativeStreamAdapter(handle, signal);
  pushFn = event => {
    adapter.push(event);
  };
  for (const event of buffer) {
    adapter.push(event);
  }
  return adapter;
}

function llmDispatchPreparedStream(
  routes: LlmPreparedDispatchRoute[],
  signal?: AbortSignal
): AsyncIterableIterator<LlmStreamEvent> {
  if (!nativeLlmModule.llmDispatchPreparedStream) {
    throw new Error('native prepared llm stream dispatch is not available');
  }

  let adapter: NativeStreamAdapter<LlmStreamEvent> | undefined;
  const buffer: (LlmStreamEvent | null)[] = [];
  let pushFn = (event: LlmStreamEvent | null) => {
    buffer.push(event);
  };
  const handle = nativeLlmModule.llmDispatchPreparedStream(
    JSON.stringify(routes),
    (error, eventJson) => {
      if (error) {
        pushFn({ type: 'error', message: error.message, raw: eventJson });
        return;
      }
      if (eventJson === LLM_STREAM_END_MARKER) {
        pushFn(null);
        return;
      }
      try {
        pushFn(parseLlmEventJson(eventJson));
      } catch (error) {
        pushFn({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'failed to parse native prepared stream event',
          raw: eventJson,
        });
      }
    }
  );
  adapter = new NativeStreamAdapter(handle, signal);
  pushFn = event => {
    adapter.push(event);
  };
  for (const event of buffer) {
    adapter.push(event);
  }
  return adapter;
}

type LlmChatStreamDispatchPlanInput = {
  preparedRoutes: LlmPreparedDispatchRoute[];
  signal?: AbortSignal;
};

export function llmDispatchPlanStream(
  input: LlmChatStreamDispatchPlanInput
): AsyncIterableIterator<
  | LlmToolLoopStreamEvent
  | {
      type: 'tool_call_delta';
      call_id: string;
      name?: string;
      arguments_delta: string;
    }
> {
  return llmDispatchPreparedStream(input.preparedRoutes, input.signal);
}

export function llmDispatchToolLoopStream(
  protocol: LlmProtocol,
  backendConfig: LlmBackendConfig,
  request: LlmRequest,
  toolCallback: (
    request: LlmToolCallbackRequest
  ) => LlmToolCallbackResponse | Promise<LlmToolCallbackResponse>,
  maxSteps: number,
  signal?: AbortSignal
): AsyncIterableIterator<LlmToolLoopStreamEvent> {
  if (!nativeLlmModule.llmDispatchToolLoopStream) {
    throw new Error('native llm tool loop dispatch is not available');
  }

  let adapter: NativeStreamAdapter<LlmToolLoopStreamEvent> | undefined;
  const buffer: (LlmToolLoopStreamEvent | null)[] = [];
  let pushFn = (event: LlmToolLoopStreamEvent | null) => {
    buffer.push(event);
  };
  const handle = nativeLlmModule.llmDispatchToolLoopStream(
    protocol,
    JSON.stringify(backendConfig),
    JSON.stringify(request),
    maxSteps,
    (error, eventJson) => {
      if (error) {
        pushFn({ type: 'error', message: error.message, raw: eventJson });
        return;
      }
      if (eventJson === LLM_STREAM_END_MARKER) {
        pushFn(null);
        return;
      }
      try {
        pushFn(parseLlmToolLoopStreamEvent(eventJson));
      } catch (error) {
        pushFn({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'failed to parse native tool loop stream event',
          raw: eventJson,
        });
      }
    },
    async (error, requestJson) => {
      if (error) {
        throw error;
      }
      return await callLlmToolCallback(requestJson, toolCallback);
    }
  );
  adapter = new NativeStreamAdapter(handle, signal);
  pushFn = event => {
    adapter.push(event);
  };
  for (const event of buffer) {
    adapter.push(event);
  }
  return adapter;
}

export function llmDispatchToolLoopStreamRouted(
  routes: LlmRoutedBackend[],
  request: LlmRequest,
  toolCallback: (
    request: LlmToolCallbackRequest
  ) => LlmToolCallbackResponse | Promise<LlmToolCallbackResponse>,
  maxSteps: number,
  signal?: AbortSignal
): AsyncIterableIterator<LlmToolLoopStreamEvent> {
  if (!nativeLlmModule.llmDispatchToolLoopStreamRouted) {
    throw new Error('native routed llm tool loop dispatch is not available');
  }

  let adapter: NativeStreamAdapter<LlmToolLoopStreamEvent> | undefined;
  const buffer: (LlmToolLoopStreamEvent | null)[] = [];
  let pushFn = (event: LlmToolLoopStreamEvent | null) => {
    buffer.push(event);
  };
  const handle = nativeLlmModule.llmDispatchToolLoopStreamRouted(
    JSON.stringify(routes),
    JSON.stringify(request),
    maxSteps,
    (error, eventJson) => {
      if (error) {
        pushFn({ type: 'error', message: error.message, raw: eventJson });
        return;
      }
      if (eventJson === LLM_STREAM_END_MARKER) {
        pushFn(null);
        return;
      }
      try {
        pushFn(parseLlmToolLoopStreamEvent(eventJson));
      } catch (error) {
        pushFn({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'failed to parse native routed tool loop stream event',
          raw: eventJson,
        });
      }
    },
    async (error, requestJson) => {
      if (error) {
        throw error;
      }
      return await callLlmToolCallback(requestJson, toolCallback);
    }
  );

  const originalAbort = handle?.abort?.bind(handle);
  if (signal) {
    if (signal.aborted) {
      originalAbort?.();
    } else if (originalAbort) {
      signal.addEventListener('abort', () => originalAbort(), { once: true });
    }
  }

  adapter = new NativeStreamAdapter(handle, signal);
  pushFn = event => {
    adapter?.push(event);
  };

  for (const event of buffer) {
    adapter.push(event);
  }
  return adapter;
}

export function llmDispatchToolLoopStreamPrepared(
  routes: LlmPreparedDispatchRoute[],
  toolCallback: (
    request: LlmToolCallbackRequest
  ) => LlmToolCallbackResponse | Promise<LlmToolCallbackResponse>,
  maxSteps: number,
  signal?: AbortSignal
): AsyncIterableIterator<LlmToolLoopStreamEvent> {
  if (!nativeLlmModule.llmDispatchToolLoopStreamPrepared) {
    throw new Error('native prepared llm tool loop dispatch is not available');
  }

  let adapter: NativeStreamAdapter<LlmToolLoopStreamEvent> | undefined;
  const buffer: (LlmToolLoopStreamEvent | null)[] = [];
  let pushFn = (event: LlmToolLoopStreamEvent | null) => {
    buffer.push(event);
  };
  const handle = nativeLlmModule.llmDispatchToolLoopStreamPrepared(
    JSON.stringify(routes),
    maxSteps,
    (error, eventJson) => {
      if (error) {
        pushFn({ type: 'error', message: error.message, raw: eventJson });
        return;
      }
      if (eventJson === LLM_STREAM_END_MARKER) {
        pushFn(null);
        return;
      }
      try {
        pushFn(parseLlmToolLoopStreamEvent(eventJson));
      } catch (error) {
        pushFn({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'failed to parse native prepared tool loop stream event',
          raw: eventJson,
        });
      }
    },
    async (error, requestJson) => {
      if (error) {
        throw error;
      }
      return await callLlmToolCallback(requestJson, toolCallback);
    }
  );

  adapter = new NativeStreamAdapter(handle, signal);
  pushFn = event => {
    adapter?.push(event);
  };

  for (const event of buffer) {
    adapter.push(event);
  }
  return adapter;
}

export {
  type LlmEmbeddingRequestContract as LlmEmbeddingRequest,
  type LlmRerankRequestContract as LlmRerankRequest,
  type BuiltInPromptRenderContract as NativeBuiltInPromptRenderRequest,
  type BuiltInPromptSessionContract as NativeBuiltInPromptSessionRenderRequest,
  type PromptTokenCountContract as NativePromptCountTokensRequest,
  type PromptTokenCountResult as NativePromptCountTokensResponse,
  type PromptMetadataContract as NativePromptMetadataRequest,
  type PromptMetadataResult as NativePromptMetadataResponse,
  type PromptRenderContract as NativePromptRenderRequest,
  type PromptRenderResult as NativePromptRenderResponse,
  type PromptSessionContract as NativePromptSessionRenderRequest,
  type PromptSessionResult as NativePromptSessionRenderResponse,
} from '@affine/server-native';
