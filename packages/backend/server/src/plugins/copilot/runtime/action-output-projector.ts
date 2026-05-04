import type { Turn } from '../core';
import type { ChatSession } from '../session';
import type { ActionRuntimeBridgeEvent } from './action-runtime-bridge';

type ProjectedAssistantTurn = {
  content: string;
  attachments: string[];
  metadata: Record<string, unknown>;
};

type ActionResultProjector = (
  result: unknown,
  artifacts: unknown[]
) => ProjectedAssistantTurn;

export function summarizeActionResult(result: unknown) {
  if (typeof result === 'string') {
    return result.slice(0, 500);
  }
  if (result === undefined || result === null) {
    return '';
  }
  return JSON.stringify(result).slice(0, 500);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function attachmentUrls(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(attachmentUrls);
  }
  if (typeof value === 'string') {
    return [value];
  }
  if (value && typeof value === 'object' && 'url' in value) {
    const url = (value as { url?: unknown }).url;
    return typeof url === 'string' ? [url] : [];
  }
  return [];
}

function textResult(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }
  if (result && typeof result === 'object') {
    const value = result as {
      content?: unknown;
      text?: unknown;
      result?: unknown;
      params?: unknown;
    };
    if (typeof value.content === 'string') return value.content;
    if (typeof value.text === 'string') return value.text;
    if (typeof value.result === 'string') return value.result;
  }
  throw new Error('Action result does not match text output contract');
}

function metadataFromParams(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const params = (result as { params?: unknown }).params;
  return params && typeof params === 'object' && !Array.isArray(params)
    ? (params as Record<string, unknown>)
    : {};
}

function projectTextResult(result: unknown): ProjectedAssistantTurn {
  return {
    content: textResult(result),
    attachments: stringArray(
      result && typeof result === 'object'
        ? (result as { attachments?: unknown }).attachments
        : undefined
    ),
    metadata: metadataFromParams(result),
  };
}

function projectImageResult(
  result: unknown,
  artifacts: unknown[]
): ProjectedAssistantTurn {
  const attachments = [
    ...attachmentUrls(artifacts),
    ...attachmentUrls(
      result && typeof result === 'object'
        ? (result as { attachments?: unknown }).attachments
        : undefined
    ),
    ...attachmentUrls(result),
  ];
  if (!attachments.length) {
    throw new Error('Action result does not include image attachments');
  }
  const content = summarizeActionResult(result);
  return {
    content: typeof content === 'string' ? content : '',
    attachments,
    metadata: {},
  };
}

function isImageAction(actionId: string) {
  return actionId.startsWith('image.filter.');
}

function resolveProjector(actionId: string): ActionResultProjector | null {
  if (actionId.startsWith('transcript.audio.')) {
    return null;
  }
  if (isImageAction(actionId)) {
    return projectImageResult;
  }
  switch (actionId) {
    case 'mindmap.generate':
    case 'slides.outline':
      return result => projectTextResult(result);
    default:
      throw new Error(`No action output projector registered for ${actionId}`);
  }
}

export function projectActionResultToAssistantTurn(input: {
  session: ChatSession;
  actionId: string;
  result: unknown;
  artifacts?: unknown[];
  wasAborted: boolean;
}): Turn | null {
  const projector = resolveProjector(input.actionId);
  if (!projector) {
    return null;
  }

  const projected = input.wasAborted
    ? { content: '', attachments: [], metadata: {} }
    : projector(input.result, input.artifacts ?? []);

  return {
    conversationId: input.session.config.sessionId,
    role: 'assistant',
    content: projected.content,
    attachments: projected.attachments,
    renderTrace: [],
    toolEvents: [],
    metadata: projected.metadata,
    createdAt: new Date(),
  };
}

export type ActionChatEvent = {
  type: 'event' | 'attachment' | 'message' | 'error';
  id?: string;
  data: string | object;
};

export function projectActionEventToChatEvent(
  messageId: string | undefined,
  data: ActionRuntimeBridgeEvent
): ActionChatEvent {
  switch (data.type) {
    case 'action_done': {
      if (
        data.status !== 'succeeded' ||
        isImageAction(data.actionId) ||
        data.result === undefined
      ) {
        return { type: 'event', id: messageId, data };
      }
      return {
        type: 'message',
        id: messageId,
        data: textResult(data.result),
      };
    }
    case 'attachment':
      return {
        type: 'attachment',
        id: messageId,
        data: data.attachment ?? data,
      };
    case 'error':
      return { type: 'error', id: messageId, data };
    default:
      return { type: 'event', id: messageId, data };
  }
}
