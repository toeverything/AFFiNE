import {
  llmValidateContract,
  type NativePromptCountTokensRequest,
  type NativePromptCountTokensResponse,
  type NativePromptMetadataRequest,
  type NativePromptMetadataResponse,
  type NativePromptRenderRequest,
  type NativePromptRenderResponse,
  type NativePromptSessionRenderRequest,
  type NativePromptSessionRenderResponse,
  type PromptMessageContract as NativePromptMessageContract,
  type PromptStructuredResponseContract as NativePromptStructuredResponseContract,
} from '../../../../native';
import { normalizePromptResponseFormat } from './structured-output-contract';

// Owner: native/Rust prompt contract facade plus Node responseFormat projection.
// Prompt/message/attachment semantics belong to adapter/native contracts; this
// file keeps only TypeScript aliases and host compatibility projection helpers.
export type PromptStructuredResponseContract =
  NativePromptStructuredResponseContract;
export type PromptResponseFormat = {
  type: 'json_schema';
  responseSchemaJson?: Record<string, unknown>;
  schemaHash?: string;
  strict?: boolean;
};
export type PromptMessageContract = NativePromptMessageContract;
type PromptMessageInput = {
  role: PromptMessageContract['role'];
  content: string;
  attachments?: unknown[] | null;
  params?: Record<string, unknown> | null;
  responseFormat?: PromptResponseFormat | null;
};
export type PromptRenderContract = NativePromptRenderRequest;
export type PromptRenderResult = NativePromptRenderResponse;
export type PromptTokenCountContract = NativePromptCountTokensRequest;
export type PromptTokenCountResult = NativePromptCountTokensResponse;
export type PromptMetadataContract = NativePromptMetadataRequest;
export type PromptMetadataResult = NativePromptMetadataResponse;
export type PromptSessionContract = NativePromptSessionRenderRequest;
export type PromptSessionResult = NativePromptSessionRenderResponse;
export type NativePromptResponseFormatProjection = {
  nativeResponseFormat?: PromptStructuredResponseContract;
};
export type NativePromptMessageProjection = {
  message: PromptMessageContract;
  nativeResponseFormat?: PromptStructuredResponseContract;
};

export function projectPromptResponseFormatForNative(
  responseFormat?: PromptResponseFormat | null
): NativePromptResponseFormatProjection {
  const { nativeResponseFormat } =
    normalizePromptResponseFormat(responseFormat);

  return {
    nativeResponseFormat,
  };
}

export function projectPromptMessageForNative(
  message: PromptMessageInput
): NativePromptMessageProjection {
  const { nativeResponseFormat } = projectPromptResponseFormatForNative(
    message.responseFormat
  );
  const nativeMessage: PromptMessageContract = {
    role: message.role,
    content: message.content,
    ...(message.attachments
      ? {
          attachments:
            message.attachments as PromptMessageContract['attachments'],
        }
      : {}),
    ...(message.params
      ? { params: message.params as PromptMessageContract['params'] }
      : {}),
    ...(nativeResponseFormat ? { responseFormat: nativeResponseFormat } : {}),
  };

  return { message: nativeMessage, nativeResponseFormat };
}

export function parsePromptRenderContract(value: unknown) {
  return llmValidateContract<PromptRenderContract>(
    'promptRenderContract',
    value
  );
}

export function parsePromptSessionContract(value: unknown) {
  return llmValidateContract<PromptSessionContract>(
    'promptSessionContract',
    value
  );
}
