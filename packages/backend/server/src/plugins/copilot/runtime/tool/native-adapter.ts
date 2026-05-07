import { Logger } from '@nestjs/common';

import type { LlmRequest, LlmToolLoopStreamEvent } from '../../../../native';
import type { NodeTextMiddleware } from '../../config';
import type { PromptMessage, StreamObject } from '../../providers/types';
import {
  CitationFootnoteFormatter,
  TextStreamParser,
} from '../../providers/utils';
import type { CopilotToolSet } from '../../tools';
import { projectRuntimeEventToStreamObject } from '../contracts/runtime-event-contract';
import { createToolLoopBridge, type ToolLoopBackend } from './bridge';
import {
  type EnrichedToolCallEvent,
  type EnrichedToolResultEvent,
  NativeRuntimeAdapter,
} from './native-runtime-adapter';

type AttachmentFootnote = {
  blobId: string;
  fileName: string;
  fileType: string;
};

export type NativeProviderAdapterOptions = {
  maxSteps?: number;
  nodeTextMiddleware?: NodeTextMiddleware[];
  onUsage?: (input: {
    providerId: string;
    model?: string;
    usage?: Extract<LlmToolLoopStreamEvent, { type: 'usage' }>['usage'];
  }) => void | Promise<void>;
};

type NativeStreamDispatch = ConstructorParameters<
  typeof NativeRuntimeAdapter
>[0];

function pickAttachmentFootnote(value: unknown): AttachmentFootnote | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const blobId =
    typeof record.blobId === 'string'
      ? record.blobId
      : typeof record.blob_id === 'string'
        ? record.blob_id
        : undefined;
  const fileName =
    typeof record.fileName === 'string'
      ? record.fileName
      : typeof record.name === 'string'
        ? record.name
        : undefined;
  const fileType =
    typeof record.fileType === 'string'
      ? record.fileType
      : typeof record.mimeType === 'string'
        ? record.mimeType
        : 'application/octet-stream';

  if (!blobId || !fileName) {
    return null;
  }

  return { blobId, fileName, fileType };
}

function collectAttachmentFootnotes(
  event: EnrichedToolResultEvent
): AttachmentFootnote[] {
  if (event.name === 'blob_read') {
    const item = pickAttachmentFootnote(event.output);
    return item ? [item] : [];
  }

  if (event.name === 'doc_semantic_search' && Array.isArray(event.output)) {
    return event.output
      .map(item => pickAttachmentFootnote(item))
      .filter((item): item is AttachmentFootnote => item !== null);
  }

  return [];
}

function formatAttachmentFootnotes(
  attachments: AttachmentFootnote[],
  options: { includeReferences?: boolean } = {}
) {
  const references =
    options.includeReferences === false
      ? ''
      : attachments.map((_, index) => `[^${index + 1}]`).join('');
  const definitions = attachments
    .map((attachment, index) => {
      return `[^${index + 1}]: ${JSON.stringify({
        type: 'attachment',
        blobId: attachment.blobId,
        fileName: attachment.fileName,
        fileType: attachment.fileType,
      })}`;
    })
    .join('\n');

  return references
    ? `\n\n${references}\n\n${definitions}`
    : `\n\n${definitions}`;
}

export class NativeProviderAdapter {
  readonly logger = new Logger(NativeProviderAdapter.name);
  readonly #runtime: NativeRuntimeAdapter;
  readonly #enableCallout: boolean;
  readonly #enableCitationFootnote: boolean;
  readonly #onUsage?: NativeProviderAdapterOptions['onUsage'];

  constructor(
    dispatchWithTools: NativeStreamDispatch,
    options: NativeProviderAdapterOptions = {}
  ) {
    this.#runtime = new NativeRuntimeAdapter(dispatchWithTools);
    const enabledNodeTextMiddlewares = new Set(
      options.nodeTextMiddleware ?? ['citation_footnote', 'callout']
    );
    this.#enableCallout =
      enabledNodeTextMiddlewares.has('callout') ||
      enabledNodeTextMiddlewares.has('thinking_format');
    this.#enableCitationFootnote =
      enabledNodeTextMiddlewares.has('citation_footnote');
    this.#onUsage = options.onUsage;
  }

  async #recordUsageOnProviderSelected(
    event: { type: string; [key: string]: unknown },
    state: {
      model?: string;
      usage?: Extract<LlmToolLoopStreamEvent, { type: 'usage' }>['usage'];
    }
  ) {
    if (
      event.type !== 'provider_selected' ||
      typeof event.provider_id !== 'string'
    ) {
      return;
    }
    try {
      await this.#onUsage?.({
        providerId: event.provider_id,
        model: state.model,
        usage: state.usage,
      });
    } catch (error) {
      this.logger.warn(
        `Provider usage callback failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    state.usage = undefined;
  }

  async text(
    request: LlmRequest,
    signal?: AbortSignal,
    messages?: PromptMessage[]
  ) {
    let output = '';
    for await (const chunk of this.streamText(request, signal, messages)) {
      output += chunk;
    }
    return output.trim();
  }

  async *streamText(
    request: LlmRequest,
    signal?: AbortSignal,
    messages?: PromptMessage[]
  ): AsyncIterableIterator<string> {
    const textParser = this.#enableCallout ? new TextStreamParser() : null;
    const citationFormatter = this.#enableCitationFootnote
      ? new CitationFootnoteFormatter()
      : null;
    let streamPartId = 0;
    const usageState: {
      model?: string;
      usage?: Extract<LlmToolLoopStreamEvent, { type: 'usage' }>['usage'];
    } = {};

    for await (const event of this.#runtime.streamEvents(
      request,
      signal,
      messages
    )) {
      switch (event.type) {
        case 'message_start': {
          const startEvent = event as Extract<
            LlmToolLoopStreamEvent,
            { type: 'message_start' }
          >;
          usageState.model = startEvent.model;
          break;
        }
        case 'usage': {
          const usageEvent = event as Extract<
            LlmToolLoopStreamEvent,
            { type: 'usage' }
          >;
          usageState.usage = usageEvent.usage;
          break;
        }
        case 'text_delta': {
          const textEvent = event as unknown as { text: string };
          if (textParser) {
            yield textParser.parse({
              type: 'text-delta',
              id: String(streamPartId++),
              text: textEvent.text,
            });
          } else {
            yield textEvent.text;
          }
          break;
        }
        case 'reasoning_delta': {
          const reasoningEvent = event as unknown as { text: string };
          if (textParser) {
            yield textParser.parse({
              type: 'reasoning-delta',
              id: String(streamPartId++),
              text: reasoningEvent.text,
            });
          } else {
            yield reasoningEvent.text;
          }
          break;
        }
        case 'tool_call': {
          if (textParser) {
            const toolCallEvent = event as EnrichedToolCallEvent;
            yield textParser.parse({
              type: 'tool-call',
              toolCallId: toolCallEvent.call_id,
              toolName: toolCallEvent.name,
              input: toolCallEvent.arguments,
            });
          }
          break;
        }
        case 'tool_result': {
          if (!textParser) break;
          const normalized = event as EnrichedToolResultEvent;
          yield textParser.parse({
            type: 'tool-result',
            toolCallId: normalized.call_id,
            toolName: normalized.name as never,
            input: normalized.arguments,
            output: normalized.output,
          });
          break;
        }
        case 'citation': {
          if (citationFormatter) {
            const citationEvent = event as unknown as {
              index: number;
              url: string;
            };
            citationFormatter.consume({
              type: 'citation',
              index: citationEvent.index,
              url: citationEvent.url,
            });
          }
          break;
        }
        case 'done': {
          const doneEvent = event as Extract<
            LlmToolLoopStreamEvent,
            { type: 'done' }
          >;
          usageState.usage = doneEvent.usage ?? usageState.usage;
          const footnotes = textParser?.end() ?? '';
          const citations = citationFormatter?.end() ?? '';
          const tails = [citations, footnotes].filter(Boolean).join('\n');
          if (tails) {
            yield `\n${tails}`;
          }
          break;
        }
        case 'provider_selected':
          await this.#recordUsageOnProviderSelected(event, usageState);
          break;
        case 'error':
          throw new Error(
            typeof event.message === 'string'
              ? event.message
              : 'native runtime stream error'
          );
        default:
          break;
      }
    }
  }

  async *streamObject(
    request: LlmRequest,
    signal?: AbortSignal,
    messages?: PromptMessage[]
  ): AsyncIterableIterator<StreamObject> {
    const citationFormatter = this.#enableCitationFootnote
      ? new CitationFootnoteFormatter()
      : null;
    const fallbackAttachmentFootnotes = new Map<string, AttachmentFootnote>();
    let hasFootnoteReference = false;
    const usageState: {
      model?: string;
      usage?: Extract<LlmToolLoopStreamEvent, { type: 'usage' }>['usage'];
    } = {};

    for await (const event of this.#runtime.streamEvents(
      request,
      signal,
      messages
    )) {
      switch (event.type) {
        case 'message_start': {
          const startEvent = event as Extract<
            LlmToolLoopStreamEvent,
            { type: 'message_start' }
          >;
          usageState.model = startEvent.model;
          break;
        }
        case 'usage': {
          const usageEvent = event as Extract<
            LlmToolLoopStreamEvent,
            { type: 'usage' }
          >;
          usageState.usage = usageEvent.usage;
          break;
        }
        case 'text_delta': {
          const textEvent = event as unknown as { text: string };
          if (textEvent.text.includes('[^')) {
            hasFootnoteReference = true;
          }
          yield { type: 'text-delta', textDelta: textEvent.text };
          break;
        }
        case 'reasoning_delta': {
          const reasoningEvent = event as unknown as { text: string };
          yield { type: 'reasoning', textDelta: reasoningEvent.text };
          break;
        }
        case 'tool_call': {
          const streamObject = projectRuntimeEventToStreamObject(
            event as LlmToolLoopStreamEvent
          );
          if (!streamObject) break;
          yield streamObject;
          break;
        }
        case 'tool_result': {
          const normalized = event as EnrichedToolResultEvent;
          const attachments = collectAttachmentFootnotes(normalized);
          attachments.forEach(attachment => {
            fallbackAttachmentFootnotes.set(attachment.blobId, attachment);
          });
          const streamObject = projectRuntimeEventToStreamObject(
            event as LlmToolLoopStreamEvent
          );
          if (!streamObject) break;
          yield streamObject;
          break;
        }
        case 'citation': {
          if (citationFormatter) {
            const citationEvent = event as unknown as {
              index: number;
              url: string;
            };
            citationFormatter.consume({
              type: 'citation',
              index: citationEvent.index,
              url: citationEvent.url,
            });
          }
          break;
        }
        case 'done': {
          const doneEvent = event as Extract<
            LlmToolLoopStreamEvent,
            { type: 'done' }
          >;
          usageState.usage = doneEvent.usage ?? usageState.usage;
          const citations = citationFormatter?.end() ?? '';
          if (citations) {
            hasFootnoteReference = true;
            yield { type: 'text-delta', textDelta: `\n${citations}` };
          }
          if (!citations && fallbackAttachmentFootnotes.size > 0) {
            yield {
              type: 'text-delta',
              textDelta: formatAttachmentFootnotes(
                Array.from(fallbackAttachmentFootnotes.values()),
                { includeReferences: !hasFootnoteReference }
              ),
            };
          }
          break;
        }
        case 'provider_selected':
          await this.#recordUsageOnProviderSelected(event, usageState);
          break;
        case 'error':
          throw new Error(
            typeof event.message === 'string'
              ? event.message
              : 'native runtime stream error'
          );
        default:
          break;
      }
    }
  }
}

export function createNativeToolLoopAdapter(
  backend: ToolLoopBackend,
  tools: CopilotToolSet,
  options: NativeProviderAdapterOptions = {}
) {
  return new NativeProviderAdapter(
    createToolLoopBridge(backend, tools, options.maxSteps),
    options
  );
}
