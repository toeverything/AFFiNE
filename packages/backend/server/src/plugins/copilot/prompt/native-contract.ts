import {
  llmCollectPromptMetadata,
  llmCountPromptTokens,
  llmGetBuiltInPromptSpec,
  llmListBuiltInPromptSpecs,
  llmRenderBuiltInPrompt,
  llmRenderBuiltInSessionPrompt,
  llmRenderPrompt,
  llmRenderSessionPrompt,
  type NativeBuiltInPromptRenderRequest as NativeBuiltInPromptRenderContract,
  type NativeBuiltInPromptSessionRenderRequest as NativeBuiltInPromptSessionContract,
  type NativePromptCountTokensRequest as NativePromptTokenCountContract,
  type NativePromptCountTokensResponse as NativePromptTokenCountResult,
  type NativePromptMetadataRequest as NativePromptMetadataContract,
  type NativePromptMetadataResponse as NativePromptMetadataResult,
  type NativePromptRenderRequest as NativePromptRenderContract,
  type NativePromptRenderResponse as NativePromptRenderResult,
  type NativePromptSessionRenderRequest as NativePromptSessionContract,
  type NativePromptSessionRenderResponse as NativePromptSessionResult,
} from '../../../native';
import type { PromptMessage, PromptParams } from '../providers/types';
import { projectPromptMessageForNative } from '../runtime/contracts';
import type { PromptSpec } from './spec';

export type NativePromptRenderRequest = Omit<
  NativePromptRenderContract,
  'messages' | 'templateParams' | 'renderParams'
> & {
  messages: PromptMessage[];
  templateParams: PromptParams;
  renderParams: PromptParams;
};

export type NativePromptRenderResponse = Omit<
  NativePromptRenderResult,
  'messages'
> & {
  messages: PromptMessage[];
};

export type NativeBuiltInPromptRenderRequest = Omit<
  NativeBuiltInPromptRenderContract,
  'renderParams'
> & {
  renderParams: PromptParams;
};

export type NativePromptCountTokensRequest = Omit<
  NativePromptTokenCountContract,
  'messages' | 'model'
> & {
  model?: string | null;
  messages: Pick<PromptMessage, 'content'>[];
};

export type NativePromptCountTokensResponse = NativePromptTokenCountResult;

export type NativePromptMetadataRequest = Omit<
  NativePromptMetadataContract,
  'messages'
> & {
  messages: PromptMessage[];
};

export type NativePromptMetadataResponse = Omit<
  NativePromptMetadataResult,
  'templateParams'
> & {
  templateParams: PromptParams;
};

export type NativePromptSessionRenderRequest = Omit<
  NativePromptSessionContract,
  'prompt' | 'turns' | 'renderParams'
> & {
  prompt: Omit<
    NativePromptSessionContract['prompt'],
    'templateParams' | 'messages' | 'model'
  > & {
    model?: string | null;
    templateParams: PromptParams;
    messages: PromptMessage[];
  };
  turns: PromptMessage[];
  renderParams: PromptParams;
};

export type NativePromptSessionRenderResponse = Omit<
  NativePromptSessionResult,
  'messages'
> & {
  messages: PromptMessage[];
};

export type NativeBuiltInPromptSessionRenderRequest = Omit<
  NativeBuiltInPromptSessionContract,
  'turns' | 'renderParams'
> & {
  turns: PromptMessage[];
  renderParams: PromptParams;
};

type NativePromptContractMessage =
  NativePromptRenderContract['messages'][number];

function toNativePromptMessage(
  message: PromptMessage
): NativePromptContractMessage {
  return projectPromptMessageForNative(message).message;
}

function fromNativePromptMessage(
  message: NativePromptContractMessage
): PromptMessage {
  return {
    role: message.role,
    content: message.content,
    ...(message.attachments ? { attachments: message.attachments } : {}),
    ...(message.params ? { params: message.params } : {}),
    ...(message.responseFormat
      ? { responseFormat: message.responseFormat }
      : {}),
  };
}

export function renderPromptNative(
  request: NativePromptRenderRequest
): NativePromptRenderResponse {
  const normalizedMessages = request.messages.map(toNativePromptMessage);
  const rendered = llmRenderPrompt({
    messages: normalizedMessages,
    templateParams: request.templateParams,
    renderParams: request.renderParams,
  });

  return {
    ...rendered,
    messages: rendered.messages.map(fromNativePromptMessage),
  };
}

export function renderBuiltInPromptNative(
  request: NativeBuiltInPromptRenderRequest
): NativePromptRenderResponse {
  const rendered = llmRenderBuiltInPrompt({
    name: request.name,
    renderParams: request.renderParams,
  });

  return {
    ...rendered,
    messages: rendered.messages.map(fromNativePromptMessage),
  };
}

export function renderPromptSessionNative(
  request: NativePromptSessionRenderRequest
): NativePromptSessionRenderResponse {
  const rendered = llmRenderSessionPrompt({
    ...request,
    prompt: {
      ...request.prompt,
      messages: request.prompt.messages.map(toNativePromptMessage),
      model: request.prompt.model ?? undefined,
    },
    turns: request.turns.map(toNativePromptMessage),
    renderParams: request.renderParams,
  });
  return {
    ...rendered,
    messages: rendered.messages.map(fromNativePromptMessage),
  };
}

export function renderBuiltInPromptSessionNative(
  request: NativeBuiltInPromptSessionRenderRequest
): NativePromptSessionRenderResponse {
  const rendered = llmRenderBuiltInSessionPrompt({
    ...request,
    turns: request.turns.map(toNativePromptMessage),
    renderParams: request.renderParams,
  });

  return {
    ...rendered,
    messages: rendered.messages.map(fromNativePromptMessage),
  };
}

export function countPromptTokensNative(
  request: NativePromptCountTokensRequest
): NativePromptCountTokensResponse {
  return llmCountPromptTokens({
    ...request,
    model: request.model ?? undefined,
  });
}

export function collectPromptMetadataNative(
  request: NativePromptMetadataRequest
): NativePromptMetadataResponse {
  return llmCollectPromptMetadata({
    messages: request.messages.map(toNativePromptMessage),
  });
}

export function listBuiltInPromptSpecsNative(): PromptSpec[] {
  return llmListBuiltInPromptSpecs().map(spec => ({
    name: spec.name,
    action: spec.action,
    model: spec.model,
    optionalModels: spec.optionalModels,
    config: spec.config,
    params: spec.params
      ? Object.fromEntries(
          Object.entries(spec.params).map(([key, value]) => [
            key,
            {
              default: value.default,
              enum: value.enumValues,
            },
          ])
        )
      : undefined,
    messages: spec.messages.map(message => ({
      role: message.role,
      template: message.template,
    })),
  }));
}

export function getBuiltInPromptSpecNative(name: string): PromptSpec | null {
  const spec = llmGetBuiltInPromptSpec(name);
  if (!spec) {
    return null;
  }

  return {
    name: spec.name,
    action: spec.action,
    model: spec.model,
    optionalModels: spec.optionalModels,
    config: spec.config,
    params: spec.params
      ? Object.fromEntries(
          Object.entries(spec.params).map(([key, value]) => [
            key,
            {
              default: value.default,
              enum: value.enumValues,
            },
          ])
        )
      : undefined,
    messages: spec.messages.map(message => ({
      role: message.role,
      template: message.template,
    })),
  };
}
