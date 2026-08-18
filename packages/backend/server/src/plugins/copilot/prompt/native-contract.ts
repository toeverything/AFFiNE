import {
  llmGetBuiltInPromptSpec,
  llmListBuiltInPromptSpecs,
  llmRenderBuiltInPrompt,
  llmRenderBuiltInSessionPrompt,
  type NativeBuiltInPromptRenderRequest as NativeBuiltInPromptRenderContract,
  type NativeBuiltInPromptSessionRenderRequest as NativeBuiltInPromptSessionContract,
  type NativePromptRenderResponse as NativePromptRenderResult,
  type NativePromptSessionRenderResponse as NativePromptSessionResult,
} from '../../../native';
import type { PromptMessage, PromptParams } from '../providers/types';
import { projectPromptMessageForNative } from '../runtime/contracts';
import type { PromptSpec } from './spec';

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

type NativePromptContractMessage = NativePromptRenderResult['messages'][number];

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

export function listBuiltInPromptSpecsNative(): PromptSpec[] {
  return llmListBuiltInPromptSpecs().map(spec => ({
    name: spec.name,
    action: spec.action,
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
