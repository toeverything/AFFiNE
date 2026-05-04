import type { PromptMessage, StreamObject } from '../providers/types';
import {
  streamObjectToToolEvent,
  toolEventToStreamObject,
} from '../runtime/contracts/runtime-event-contract';
import type { ChatMessage } from '../types';
import { type ToolEvent, type Turn, TurnSchema } from './types';

const normalizeRenderTrace = (
  streamObjects: StreamObject[]
): StreamObject[] => {
  return streamObjects.reduce((acc, current) => {
    const previous = acc.at(-1);

    switch (current.type) {
      case 'reasoning':
      case 'text-delta': {
        if (previous?.type === current.type) {
          previous.textDelta += current.textDelta;
        } else {
          acc.push({ ...current });
        }
        break;
      }
      case 'tool-result': {
        const index = acc.findIndex(
          candidate =>
            candidate.type === 'tool-call' &&
            candidate.toolCallId === current.toolCallId &&
            candidate.toolName === current.toolName
        );
        if (index !== -1) {
          acc[index] = { ...current };
        } else {
          acc.push({ ...current });
        }
        break;
      }
      default: {
        acc.push({ ...current });
        break;
      }
    }

    return acc;
  }, [] as StreamObject[]);
};

const deriveToolEvents = (renderTrace: StreamObject[]): ToolEvent[] =>
  renderTrace
    .map(streamObjectToToolEvent)
    .filter((event): event is ToolEvent => !!event);

export const canonicalizeTurnTrace = (trace: {
  renderTrace?: StreamObject[];
  toolEvents?: ToolEvent[];
}) => {
  const renderTrace =
    trace.renderTrace && trace.renderTrace.length
      ? normalizeRenderTrace(trace.renderTrace)
      : trace.toolEvents?.length
        ? trace.toolEvents.map(toolEventToStreamObject)
        : [];

  return { renderTrace, toolEvents: deriveToolEvents(renderTrace) };
};

export const turnFromChatMessage = (
  message: ChatMessage,
  conversationId: string
): Turn => {
  const trace = canonicalizeTurnTrace({
    renderTrace: message.streamObjects ?? [],
  });

  return TurnSchema.parse({
    id: message.id,
    conversationId,
    role: message.role,
    content: message.content,
    attachments: message.attachments ?? [],
    renderTrace: trace.renderTrace,
    toolEvents: trace.toolEvents,
    metadata: message.params ?? {},
    createdAt: message.createdAt,
  });
};

export const chatMessageFromTurn = (turn: Turn): ChatMessage => {
  const { renderTrace } = canonicalizeTurnTrace(turn);

  return {
    id: turn.id,
    role: turn.role,
    content: turn.content,
    attachments: turn.attachments.length ? turn.attachments : undefined,
    params: turn.metadata,
    streamObjects: renderTrace.length ? renderTrace : undefined,
    createdAt: turn.createdAt,
  };
};

export const promptMessageFromTurn = (turn: Turn): PromptMessage => ({
  role: turn.role,
  content: turn.content,
  attachments: turn.attachments.length ? turn.attachments : undefined,
  params: Object.keys(turn.metadata).length ? turn.metadata : undefined,
});
