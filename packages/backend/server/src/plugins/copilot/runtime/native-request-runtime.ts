import { CopilotPromptInvalid } from '../../../base';
import {
  llmBuildCanonicalRequest,
  llmBuildCanonicalStructuredRequest,
  type LlmRequest,
  type LlmStructuredRequest,
  type NativePromptMessageInput,
} from '../../../native';
import type { ProviderMiddlewareConfig } from '../config';
import { applyPromptAttachmentMimeTypeHintForNative } from '../providers/attachments';
import type {
  CopilotChatOptions,
  CopilotStructuredOptions,
  ModelAttachmentCapability,
  PromptMessage,
} from '../providers/types';
import { type StructuredOutputContract, type ToolContract } from './contracts';

export type BuildCanonicalNativeRequestOptions = {
  model: string;
  messages: PromptMessage[];
  options?: CopilotChatOptions | CopilotStructuredOptions;
  toolContracts?: ToolContract[];
  withAttachment?: boolean;
  attachmentCapability?: ModelAttachmentCapability;
  include?: string[];
  reasoning?: Record<string, unknown>;
  responseContract?: StructuredOutputContract;
  middleware?: ProviderMiddlewareConfig;
};

export type BuildCanonicalNativeRequestResult = {
  request: LlmRequest;
};

export type BuildCanonicalNativeStructuredRequestResult = {
  request: LlmStructuredRequest;
};

type BuildCanonicalNativeStructuredRequestOptions = Omit<
  BuildCanonicalNativeRequestOptions,
  'toolContracts' | 'include' | 'options' | 'responseContract'
> & {
  options?: CopilotStructuredOptions;
  responseContract: StructuredOutputContract;
};

type BuildNativeStructuredRequestResult = {
  request: LlmStructuredRequest;
};

function mapNativeRequestBuilderError(error: unknown): never {
  if (error instanceof CopilotPromptInvalid) {
    throw error;
  }

  if (
    error instanceof Error &&
    /Native path does not support .*attachments?|Schema is required/i.test(
      error.message
    )
  ) {
    throw new CopilotPromptInvalid(error.message);
  }

  throw error;
}

export function preparePromptMessagesForNativeRequest(
  messages: PromptMessage[],
  withAttachment: boolean
): NativePromptMessageInput[] {
  return messages.map(message => {
    const attachments =
      withAttachment && Array.isArray(message.attachments)
        ? message.attachments.map(attachment =>
            applyPromptAttachmentMimeTypeHintForNative(attachment, message)
          )
        : undefined;

    return {
      role: message.role,
      content: message.content,
      ...(attachments?.length ? { attachments } : {}),
    };
  });
}

export async function buildCanonicalNativeRequest({
  model,
  messages,
  options = {},
  toolContracts = [],
  withAttachment = true,
  attachmentCapability,
  include,
  reasoning,
  responseContract,
  middleware,
}: BuildCanonicalNativeRequestOptions): Promise<BuildCanonicalNativeRequestResult> {
  const copiedMessages = messages.map(message => ({
    ...message,
    attachments: message.attachments
      ? [...message.attachments]
      : message.attachments,
  }));
  const explicitResponseContract = responseContract ?? {};
  const normalizedMessages = preparePromptMessagesForNativeRequest(
    copiedMessages,
    withAttachment
  );
  let request: LlmRequest;
  try {
    request = llmBuildCanonicalRequest({
      model,
      messages: normalizedMessages,
      maxTokens: options.maxTokens ?? undefined,
      temperature: options.temperature ?? undefined,
      tools: toolContracts,
      include,
      reasoning,
      responseSchema: explicitResponseContract.responseSchemaJson,
      attachmentCapability: attachmentCapability
        ? {
            kinds: attachmentCapability.kinds,
            sourceKinds: attachmentCapability.sourceKinds,
            allowRemoteUrls: attachmentCapability.allowRemoteUrls,
          }
        : undefined,
      middleware: middleware?.rust
        ? { request: middleware.rust.request, stream: middleware.rust.stream }
        : undefined,
    });
  } catch (error) {
    mapNativeRequestBuilderError(error);
  }

  return {
    request,
  };
}

export async function buildCanonicalNativeStructuredRequest({
  model,
  messages,
  options = {},
  withAttachment = true,
  attachmentCapability,
  reasoning,
  responseContract,
  middleware,
}: BuildCanonicalNativeStructuredRequestOptions): Promise<BuildCanonicalNativeStructuredRequestResult> {
  const copiedMessages = messages.map(message => ({
    ...message,
    attachments: message.attachments
      ? [...message.attachments]
      : message.attachments,
  }));
  const explicitResponseContract = responseContract;
  if (!explicitResponseContract?.responseSchemaJson) {
    throw new CopilotPromptInvalid('Schema is required');
  }

  const normalizedMessages = preparePromptMessagesForNativeRequest(
    copiedMessages,
    withAttachment
  );
  let request: LlmStructuredRequest;
  try {
    request = llmBuildCanonicalStructuredRequest({
      model,
      messages: normalizedMessages,
      schema: explicitResponseContract?.responseSchemaJson,
      maxTokens: options.maxTokens ?? undefined,
      temperature: options.temperature ?? undefined,
      reasoning,
      strict: options.strict,
      responseMimeType: 'application/json',
      attachmentCapability: attachmentCapability
        ? {
            kinds: attachmentCapability.kinds,
            sourceKinds: attachmentCapability.sourceKinds,
            allowRemoteUrls: attachmentCapability.allowRemoteUrls,
          }
        : undefined,
      middleware: middleware?.rust
        ? { request: middleware.rust.request }
        : undefined,
    });
  } catch (error) {
    mapNativeRequestBuilderError(error);
  }

  return { request };
}

export async function buildNativeRequest({
  model,
  messages,
  options = {},
  toolContracts = [],
  withAttachment = true,
  attachmentCapability,
  include,
  reasoning,
  responseContract,
  middleware,
}: BuildCanonicalNativeRequestOptions): Promise<BuildCanonicalNativeRequestResult> {
  const { request } = await buildCanonicalNativeRequest({
    model,
    messages,
    options,
    toolContracts,
    withAttachment,
    attachmentCapability,
    include,
    reasoning,
    responseContract,
    middleware,
  });

  return {
    request: {
      ...request,
      stream: true,
    },
  };
}

export async function buildNativeStructuredRequest({
  model,
  messages,
  options = {},
  withAttachment = true,
  attachmentCapability,
  reasoning,
  responseContract,
  middleware,
}: Omit<
  BuildCanonicalNativeRequestOptions,
  'toolContracts' | 'include' | 'responseContract'
> & {
  responseContract: StructuredOutputContract;
}): Promise<BuildNativeStructuredRequestResult> {
  return await buildCanonicalNativeStructuredRequest({
    model,
    messages,
    options,
    withAttachment,
    attachmentCapability,
    reasoning,
    responseContract,
    middleware,
  });
}
