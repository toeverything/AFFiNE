import serverNativeModule, {
  type AssertSafeUrlRequest,
  type BackendRuntimeHealth,
  type BuiltInPromptRenderContract,
  type BuiltInPromptSessionContract,
  type BuiltInPromptSpec,
  type BuiltInRouteOptions,
  type CanonicalChatRequestContract,
  type CanonicalStructuredRequestContract,
  type CapabilityAttachmentContract,
  type CapabilityModelCapability,
  type CommandResponse,
  type CompileScopeInput,
  type ContentPolicyScanInput,
  type ContentPolicyScanResult,
  type DocumentEmbeddingProjectionInput,
  type EmbeddingHealth,
  type EnsureWorkspaceBlobArtifactInput,
  type ImageInspection,
  type ImageInspectionOptions,
  type LicenseError,
  type LicenseHealthRequest,
  type LicenseInfo,
  type LicenseKeyRequest,
  type LicenseRecurringRequest,
  type LicenseResponse,
  type LicenseSeatsRequest,
  type LlmCoreMessage,
  type LlmEmbeddingRequestContract,
  type LlmImageRequestContract,
  type LlmRequestContract,
  type LlmRerankRequestContract,
  type LlmStructuredRequestContract,
  type MatchEmbeddingCandidatesInput,
  type ModelConditionsContract,
  type PortalResponse,
  type PromptMessageContract,
  type PromptRenderResult,
  type PromptSessionResult,
  type PromptStructuredResponseContract,
  type PutWorkspaceArtifactInput,
  type ReadEmbeddingSourceContentInput,
  type RemoteAttachmentFetchRequest,
  type RemoteAttachmentFetchResponse,
  type RemoteMimeTypeRequest,
  type ResolvedEntitlement,
  type ResolveEntitlementInput,
  type RuntimeAggregateRequest,
  type RuntimeBlobCleanupExecuteResult,
  type RuntimeBlobCleanupPlanResult,
  type RuntimeBlobCleanupResult,
  type RuntimeBlobCompleteResult,
  type RuntimeBlobMetadataBackfillResult,
  type RuntimeDocBlobRefsResult,
  type RuntimeDocCompactionResult,
  type RuntimeEmbeddingCandidate,
  type RuntimeEmbeddingSourceContent,
  type RuntimeEmbeddingWorkspaceState,
  type RuntimeMagicLinkOtpConsumeResult,
  type RuntimeMultipartUploadInit,
  type RuntimeMultipartUploadPart,
  type RuntimeObjectGetResult,
  type RuntimeObjectListEntry,
  type RuntimeObjectMetadata,
  type RuntimeObjectStoragePutOptions,
  type RuntimePresignedObjectRequest,
  type RuntimeRetrievalScope,
  type RuntimeSearchQuery,
  type RuntimeSearchRequest,
  type RuntimeTurnScopeSnapshot,
  type RuntimeVerificationTokenRecord,
  type RuntimeWorkspaceArtifact,
  type RuntimeWorkspaceInviteLinkRecord,
  type SafeFetchRequest,
  type SafeFetchResponse,
  type StorageProviderCapabilities,
  type StorageRuntimeHealth,
  type SyncEmbeddingStateInput,
  type Tokenizer,
} from '@affine/server-native';

export type {
  BuiltInManagedTarget,
  BuiltInManagedTargetTier,
  BuiltInRouteOptions,
  ByokCapabilityInput,
  ByokCatalogModelOutput,
  ByokCatalogOutput,
  ByokCatalogProviderOutput,
  ByokEndpointInput,
  ByokLocalLeaseOutput,
  ByokModelDeclarationInput,
  ByokModelProbeCheckOutput,
  ByokModelProbeOutput,
  ByokPolicyOutput,
  ByokProbeCheckInput,
  ByokProbeResultOutput,
  ByokProbeStatusOutput,
  ByokProfileDefinitionInput,
  ByokProfileOutput,
  ByokValidationOutput,
  CopilotAccessProjection,
  CopilotExecuteInput,
  CopilotRouteCheckInput,
  CopilotTargetOverrideInput,
  CreateByokLocalLeaseInput,
  CreateByokLocalLeaseProviderInput,
  CreateByokProfileInput,
  ProbeByokDraftInput,
  ProbeByokProfileInput,
  ReorderByokProfilesInput,
  ReplaceByokProfileInput,
  RotateByokCredentialInput,
} from '@affine/server-native';

export type {
  AssertSafeUrlRequest,
  BackendRuntimeHealth,
  CapabilityAttachmentContract,
  CapabilityModelCapability,
  CommandResponse,
  CompileScopeInput,
  ContentPolicyScanInput,
  ContentPolicyScanResult,
  DocumentEmbeddingProjectionInput,
  EmbeddingHealth,
  EnsureWorkspaceBlobArtifactInput,
  ImageInspection,
  ImageInspectionOptions,
  LicenseError,
  LicenseHealthRequest,
  LicenseInfo,
  LicenseKeyRequest,
  LicenseRecurringRequest,
  LicenseResponse,
  LicenseSeatsRequest,
  MatchEmbeddingCandidatesInput,
  ModelConditionsContract,
  PortalResponse,
  PromptMessageContract,
  PromptStructuredResponseContract,
  PutWorkspaceArtifactInput,
  ReadEmbeddingSourceContentInput,
  RemoteAttachmentFetchRequest,
  RemoteAttachmentFetchResponse,
  RemoteMimeTypeRequest,
  ResolvedEntitlement,
  ResolveEntitlementInput,
  RuntimeAggregateRequest,
  RuntimeBlobCleanupExecuteResult,
  RuntimeBlobCleanupPlanResult,
  RuntimeBlobCleanupResult,
  RuntimeBlobCompleteResult,
  RuntimeBlobMetadataBackfillResult,
  RuntimeDocBlobRefsResult,
  RuntimeDocCompactionResult,
  RuntimeEmbeddingCandidate,
  RuntimeEmbeddingSourceContent,
  RuntimeEmbeddingWorkspaceState,
  RuntimeMagicLinkOtpConsumeResult,
  RuntimeMultipartUploadInit,
  RuntimeMultipartUploadPart,
  RuntimeObjectGetResult,
  RuntimeObjectListEntry,
  RuntimeObjectMetadata,
  RuntimeObjectStoragePutOptions,
  RuntimePresignedObjectRequest,
  RuntimeRetrievalScope,
  RuntimeSearchQuery,
  RuntimeSearchRequest,
  RuntimeTurnScopeSnapshot,
  RuntimeVerificationTokenRecord,
  RuntimeWorkspaceArtifact,
  RuntimeWorkspaceInviteLinkRecord,
  SafeFetchRequest,
  SafeFetchResponse,
  StorageProviderCapabilities,
  StorageRuntimeHealth,
  SyncEmbeddingStateInput,
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

export type NativeActionEvent = {
  type: ActionEventType;
  actionId: string;
  actionVersion: string;
  status?: ActionRunStatus;
  stepId?: string;
  attachment?: unknown;
  result?: unknown;
  errorCode?: string;
  errorMessage?: string;
  trace?: unknown;
};

export type CopilotActionRecipe = {
  actionId: string;
  actionVersion: string;
  slot: string;
  promptRef: string;
  responseContract: { schema: Record<string, unknown>; strict: boolean } | null;
  outputProjection: string;
};

export function getCopilotActionRecipe(
  actionId: string,
  actionVersion?: string
): CopilotActionRecipe {
  return JSON.parse(
    serverNativeModule.copilotActionRecipe(actionId, actionVersion)
  ) as CopilotActionRecipe;
}

import type {
  ToolCallRequest,
  ToolCallResult,
} from './plugins/copilot/runtime/contracts/tool-contract';

export const mergeUpdatesInApplyWay = serverNativeModule.mergeUpdatesInApplyWay;
export const authorizeReservedDocSubject =
  serverNativeModule.authorizeReservedDocSubject;
export const authSessionAccessTokenKeyId =
  serverNativeModule.authSessionAccessTokenKeyId;
export const createAuthSessionRefreshToken =
  serverNativeModule.createAuthSessionRefreshToken;
export const parseAuthSessionRefreshToken =
  serverNativeModule.parseAuthSessionRefreshToken;
export const signAuthSessionAccessToken =
  serverNativeModule.signAuthSessionAccessToken;
export const verifyAuthSessionAccessToken =
  serverNativeModule.verifyAuthSessionAccessToken;

export async function validateDocUpdate(
  update: Buffer,
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<boolean> {
  const signals = [];
  if (options.signal) {
    signals.push(options.signal);
  }
  if (options.timeoutMs !== undefined) {
    signals.push(AbortSignal.timeout(options.timeoutMs));
  }
  const signal =
    signals.length === 0
      ? undefined
      : signals.length === 1
        ? signals[0]
        : AbortSignal.any(signals);

  if (signal?.aborted) {
    throw signal.reason;
  }

  return await new Promise<boolean>((resolve, reject) => {
    let settled = false;
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };
    const onAbort = () => {
      settle(() =>
        reject(
          signal?.reason instanceof Error
            ? signal.reason
            : new Error('Doc update validation aborted')
        )
      );
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    serverNativeModule
      .validateDocUpdate(update)
      .then(
        result => settle(() => resolve(result)),
        error => settle(() => reject(error))
      )
      .finally(() => {
        signal?.removeEventListener('abort', onAbort);
      });
  });
}

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
export const scanContentPolicyV1 = serverNativeModule.scanContentPolicyV1;
export const safeFetch = serverNativeModule.safeFetch;
export const activateLicense = serverNativeModule.activateLicense;
export const checkLicenseHealth = serverNativeModule.checkLicenseHealth;
export const createCustomerPortal =
  serverNativeModule.createLicenseCustomerPortal;
export const deactivateLicense = serverNativeModule.deactivateLicense;
export const updateLicenseRecurring = serverNativeModule.updateLicenseRecurring;
export const updateLicenseSeats = serverNativeModule.updateLicenseSeats;
export const parseDoc = serverNativeModule.parseDoc;
export const htmlSanitize = serverNativeModule.htmlSanitize;
export const processImage = serverNativeModule.processImage;
export const projectDocCanvasFromBinary =
  serverNativeModule.projectDocCanvasFromBinary;
export const projectDocSearchFromBinary =
  serverNativeModule.projectDocSearchFromBinary;
export const parseYDocToMarkdown = serverNativeModule.parseDocToMarkdown;
export const parsePageDocFromBinary = serverNativeModule.parsePageDoc;
export const parseWorkspaceDocFromBinary = serverNativeModule.parseWorkspaceDoc;
export const readAllDocIdsFromRootDoc =
  serverNativeModule.readAllDocIdsFromRootDoc;
export const AFFINE_PRO_PUBLIC_KEY = serverNativeModule.AFFINE_PRO_PUBLIC_KEY;
export const AFFINE_PRO_LICENSE_AES_KEY =
  serverNativeModule.AFFINE_PRO_LICENSE_AES_KEY;
export const BackendRuntime = serverNativeModule.BackendRuntime;
export const StorageRuntime = serverNativeModule.StorageRuntime;

export type PermissionWorkspaceRole = 'external' | 'member' | 'admin' | 'owner';
export type PermissionDocRole =
  | 'none'
  | 'external'
  | 'reader'
  | 'commenter'
  | 'editor'
  | 'manager'
  | 'owner';

export type PermissionEvaluationInputV1 = {
  version: 1;
  legacyCompatMode?: boolean;
  subject?: {
    userId?: string;
    groupIds?: string[];
    allowLocal?: boolean;
  };
  runtime?: {
    known?: boolean;
    stale?: boolean;
    readonly?: boolean;
    readonlyReason?: string;
    sharingEnabled?: boolean;
    urlPreviewEnabled?: boolean;
  };
  workspace?: {
    role?: PermissionWorkspaceRole;
    memberState?: 'active' | 'pending' | 'waiting_review' | 'waiting_seat';
    public?: boolean;
    sharingEnabled?: boolean;
    urlPreviewEnabled?: boolean;
    local?: boolean;
  };
  workspaceActions?: string[];
  docs?: Array<{
    docId: string;
    actions?: string[];
    explicitUserRole?: PermissionDocRole;
    groupGrants?: Array<{ groupId: string; role: PermissionDocRole }>;
    groupGrantsEnabled?: boolean;
    memberDefaultRole?: PermissionDocRole;
    publicRole?: 'external';
    visibility?: 'private' | 'public';
    sharingEnabled?: boolean;
    previewEnabled?: boolean;
  }>;
};

export type PermissionDecisionV1 = {
  action: string;
  allowed: boolean;
  sources: Array<{
    type:
      | 'workspace-member'
      | 'workspace-policy'
      | 'workspace-preview-policy'
      | 'local-workspace'
      | 'inherited-workspace-role'
      | 'doc-grant'
      | 'group-grant'
      | 'member-default-policy'
      | 'public-policy'
      | 'doc-preview-policy';
    role?: string;
  }>;
  restrictions: Array<{
    type: 'runtime_unknown' | 'runtime_stale' | 'readonly' | 'sharing-disabled';
    reason?: string;
  }>;
};

export type PermissionEvaluationOutputV1 = {
  version: 1;
  workspace: {
    resourceOwnerRole?: PermissionWorkspaceRole;
    effectiveRole?: PermissionWorkspaceRole;
    decisions: PermissionDecisionV1[];
  };
  docs: Array<{
    docId: string;
    resourceOwnerRole?: 'owner';
    effectiveRole?: PermissionDocRole;
    decisions: PermissionDecisionV1[];
  }>;
};

export const evaluatePermissionV1 = (
  input: PermissionEvaluationInputV1
): PermissionEvaluationOutputV1 =>
  serverNativeModule.evaluatePermissionV1(input);

export const permissionActionRoleMatrixV1 = (): unknown =>
  serverNativeModule.permissionActionRoleMatrixV1();

export const permissionActionRoleMatrixV1Json =
  serverNativeModule.permissionActionRoleMatrixV1Json;

export const resolveEntitlementV1 = (
  input: ResolveEntitlementInput
): ResolvedEntitlement => serverNativeModule.resolveEntitlementV1(input);

// MCP write tools exports
export const createDocWithMarkdown = serverNativeModule.createDocWithMarkdown;
export const updateDocWithMarkdown = serverNativeModule.updateDocWithMarkdown;
export const addDocToRootDoc = serverNativeModule.addDocToRootDoc;
export const buildPublicRootDoc = serverNativeModule.buildPublicRootDoc;
export const updateDocTitle = serverNativeModule.updateDocTitle;
export const updateDocProperties = serverNativeModule.updateDocProperties;
export const updateRootDocMetaTitle = serverNativeModule.updateRootDocMetaTitle;

const nativeLlmModule = serverNativeModule;

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

export type LlmImageRequest = LlmImageRequestContract;

export type LlmImageRequestBuildInput = {
  model: string;
  messages: PromptMessageContract[];
  options?: {
    quality?: string;
    seed?: number;
    modelName?: string | null;
    loras?: unknown;
  };
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

export type LlmStructuredResponse = {
  id: string;
  model: string;
  output_text: string;
  output_json?: unknown;
  usage: LlmDispatchResponse['usage'];
  finish_reason: LlmDispatchResponse['finish_reason'];
  reasoning_details?: unknown;
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

export type LlmToolCallbackRequest = ToolCallRequest;
export type LlmToolCallbackResponse = ToolCallResult;

export function llmInferPromptModelConditions(
  messages: NativePromptMessageInput[]
): ModelConditionsContract {
  if (!nativeLlmModule.llmInferPromptModelConditions) {
    throw new Error('native prompt model condition inference is not available');
  }

  return nativeLlmModule.llmInferPromptModelConditions(messages);
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

export function llmRenderBuiltInPrompt(
  request: BuiltInPromptRenderContract
): PromptRenderResult {
  if (!nativeLlmModule.llmRenderBuiltInPrompt) {
    throw new Error('native built-in prompt renderer is not available');
  }

  return nativeLlmModule.llmRenderBuiltInPrompt(request);
}

export function llmRenderBuiltInSessionPrompt(
  request: BuiltInPromptSessionContract
): PromptSessionResult {
  if (!nativeLlmModule.llmRenderBuiltInSessionPrompt) {
    throw new Error('native built-in session prompt renderer is not available');
  }

  return nativeLlmModule.llmRenderBuiltInSessionPrompt(request);
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

export function llmGetBuiltInRouteOptions(
  name: string
): BuiltInRouteOptions | null {
  return nativeLlmModule.llmGetBuiltInRouteOptions(name);
}

export const llmGetByokCatalog = nativeLlmModule.llmGetByokCatalog;

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

export {
  type LlmEmbeddingRequestContract as LlmEmbeddingRequest,
  type LlmRerankRequestContract as LlmRerankRequest,
  type BuiltInPromptRenderContract as NativeBuiltInPromptRenderRequest,
  type BuiltInPromptSessionContract as NativeBuiltInPromptSessionRenderRequest,
  type PromptRenderResult as NativePromptRenderResponse,
  type PromptSessionResult as NativePromptSessionRenderResponse,
} from '@affine/server-native';
