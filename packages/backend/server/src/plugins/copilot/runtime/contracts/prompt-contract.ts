import type {
  PromptMessageContract as NativePromptMessageContract,
  PromptStructuredResponseContract as NativePromptStructuredResponseContract,
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
