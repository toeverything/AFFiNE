import {
  type LlmBackendConfig,
  llmCompileExecutionPlan,
  type LlmEmbeddingRequest,
  type LlmImageRequest,
  type LlmProtocol,
  type LlmRequest,
  type LlmRerankRequest,
  type LlmStructuredRequest,
} from '../../../../native';
import type {
  CopilotProviderType,
  ModelConditions,
  PromptMessage,
} from '../../providers/types';

// Owner: runtime core mirror facade.
// The semantic source of truth is the native/Rust execution-plan contract
// behind llmCompileExecutionPlan(); this file only keeps the TypeScript shape
// needed by Node live-plan assembly until generated/native TS types replace it.
export type ExecutionRequestKind =
  | 'text'
  | 'streamText'
  | 'streamObject'
  | 'structured'
  | 'embedding'
  | 'rerank'
  | 'image';

export type ExecutionRoute = {
  providerId: string;
  protocol: LlmProtocol;
  model: string;
  backendConfig: LlmBackendConfig;
};

export type ExecutionTransportContract =
  | { kind: 'chat'; request: LlmRequest }
  | { kind: 'structured'; request: LlmStructuredRequest }
  | { kind: 'embedding'; request: LlmEmbeddingRequest }
  | { kind: 'rerank'; request: LlmRerankRequest }
  | { kind: 'image'; request: LlmImageRequest };

export type SerializableExecutionPlanRequest =
  | {
      kind: 'text' | 'streamText' | 'streamObject';
      cond: ModelConditions;
      messages: PromptMessage[];
      options?: Record<string, unknown>;
    }
  | {
      kind: 'structured';
      cond: ModelConditions;
      messages: PromptMessage[];
      options?: Record<string, unknown>;
    }
  | {
      kind: 'image';
      cond: ModelConditions;
      messages: PromptMessage[];
      options?: Record<string, unknown>;
    }
  | {
      kind: 'embedding';
      cond: ModelConditions;
      modelId: string;
      input: string | string[];
      options?: Record<string, unknown>;
    }
  | {
      kind: 'rerank';
      cond: ModelConditions;
      modelId: string;
      request: {
        query: string;
        candidates: { id?: string; text: string }[];
        topK?: number;
      };
      options?: Record<string, unknown>;
    };

export type SerializableExecutionPlan = {
  routes: ExecutionRoute[];
  request: SerializableExecutionPlanRequest;
  transport?: ExecutionTransportContract;
  routePolicy: { fallbackOrder: string[] };
  runtimePolicy: {
    prefer?: CopilotProviderType;
    maxSteps?: number;
  };
  attachmentPolicy: {
    materializeRemoteAttachments: boolean;
  };
  responsePostprocess: {
    mode: ExecutionRequestKind;
  };
  hostContext?: {
    currentMessages?: PromptMessage[];
  };
};

export function parseExecutionPlan(value: unknown) {
  return llmCompileExecutionPlan<SerializableExecutionPlan>(value);
}
