import { ZodType } from 'zod';

import { CopilotPromptInvalid } from '../../../base';
import type {
  NativeLlmCoreContent,
  NativeLlmCoreMessage,
  NativeLlmEmbeddingRequest,
  NativeLlmRequest,
  NativeLlmStreamEvent,
  NativeLlmStructuredRequest,
  NativeLlmStructuredResponse,
} from '../../../native';
import type { NodeTextMiddleware, ProviderMiddlewareConfig } from '../config';
import type { CopilotToolSet } from '../tools';
import {
  canonicalizePromptAttachment,
  type CanonicalPromptAttachment,
} from './attachments';
import { NativeDispatchFn, ToolCallLoop, ToolSchemaExtractor } from './loop';
import type {
  CopilotChatOptions,
  CopilotStructuredOptions,
  ModelAttachmentCapability,
  PromptMessage,
  StreamObject,
} from './types';
import { CitationFootnoteFormatter, TextStreamParser } from './utils';

type BuildNativeRequestOptions = {
  model: string;
  messages: PromptMessage[];
  options?: CopilotChatOptions | CopilotStructuredOptions;
  tools?: CopilotToolSet;
  withAttachment?: boolean;
  attachmentCapability?: ModelAttachmentCapability;
  include?: string[];
  reasoning?: Record<string, unknown>;
  responseSchema?: unknown;
  middleware?: ProviderMiddlewareConfig;
};

type BuildNativeRequestResult = {
  request: NativeLlmRequest;
  schema?: ZodType;
};

type BuildNativeStructuredRequestResult = {
  request: NativeLlmStructuredRequest;
  schema: ZodType;
};

type ToolCallMeta = {
  name: string;
  args: Record<string, unknown>;
};

type NormalizedToolResultEvent = Extract<
  NativeLlmStreamEvent,
  { type: 'tool_result' }
> & {
  name: string;
  arguments: Record<string, unknown>;
};

type AttachmentFootnote = {
  blobId: string;
  fileName: string;
  fileType: string;
};

type NativeProviderAdapterOptions = {
  nodeTextMiddleware?: NodeTextMiddleware[];
};

function roleToCore(role: PromptMessage['role']) {
  switch (role) {
    case 'assistant':
      return 'assistant';
    case 'system':
      return 'system';
    default:
      return 'user';
  }
}

function ensureAttachmentSupported(
  attachment: CanonicalPromptAttachment,
  attachmentCapability?: ModelAttachmentCapability
) {
  if (!attachmentCapability) return;

  if (!attachmentCapability.kinds.includes(attachment.kind)) {
    throw new CopilotPromptInvalid(
      `Native path does not support ${attachment.kind} attachments${
        attachment.mediaType ? ` (${attachment.mediaType})` : ''
      }`
    );
  }

  if (
    attachmentCapability.sourceKinds?.length &&
    !attachmentCapability.sourceKinds.includes(attachment.sourceKind)
  ) {
    throw new CopilotPromptInvalid(
      `Native path does not support ${attachment.sourceKind} attachment sources`
    );
  }

  if (attachment.isRemote && attachmentCapability.allowRemoteUrls === false) {
    throw new CopilotPromptInvalid(
      'Native path does not support remote attachment urls'
    );
  }
}

function resolveResponseSchema(
  systemMessage: PromptMessage | undefined,
  responseSchema?: unknown
): ZodType | undefined {
  if (responseSchema instanceof ZodType) {
    return responseSchema;
  }

  if (systemMessage?.responseFormat?.schema instanceof ZodType) {
    return systemMessage.responseFormat.schema;
  }

  return systemMessage?.params?.schema instanceof ZodType
    ? systemMessage.params.schema
    : undefined;
}

function resolveResponseStrict(
  systemMessage: PromptMessage | undefined,
  options?: CopilotStructuredOptions
) {
  return options?.strict ?? systemMessage?.responseFormat?.strict ?? true;
}

export class StructuredResponseParseError extends Error {}

function normalizeStructuredText(text: string) {
  const trimmed = text.replaceAll(/^ny\n/g, ' ').trim();
  if (trimmed.startsWith('```') || trimmed.endsWith('```')) {
    return trimmed
      .replace(/```[\w\s-]*\n/g, '')
      .replace(/\n```/g, '')
      .trim();
  }
  return trimmed;
}

export function parseNativeStructuredOutput(
  response: Pick<NativeLlmStructuredResponse, 'output_text'> & {
    output_json?: unknown;
  }
) {
  if (response.output_json !== undefined) {
    return response.output_json;
  }

  const normalized = normalizeStructuredText(response.output_text);
  const candidates = [
    () => normalized,
    () => {
      const objectStart = normalized.indexOf('{');
      const objectEnd = normalized.lastIndexOf('}');
      return objectStart !== -1 && objectEnd > objectStart
        ? normalized.slice(objectStart, objectEnd + 1)
        : null;
    },
    () => {
      const arrayStart = normalized.indexOf('[');
      const arrayEnd = normalized.lastIndexOf(']');
      return arrayStart !== -1 && arrayEnd > arrayStart
        ? normalized.slice(arrayStart, arrayEnd + 1)
        : null;
    },
  ];

  for (const candidate of candidates) {
    try {
      const candidateText = candidate();
      if (typeof candidateText === 'string') {
        return JSON.parse(candidateText);
      }
    } catch {
      continue;
    }
  }

  throw new StructuredResponseParseError(
    `Unexpected structured response: ${normalized.slice(0, 200)}`
  );
}

async function toCoreContents(
  message: PromptMessage,
  withAttachment: boolean,
  attachmentCapability?: ModelAttachmentCapability
): Promise<NativeLlmCoreContent[]> {
  const contents: NativeLlmCoreContent[] = [];

  if (typeof message.content === 'string' && message.content.length) {
    contents.push({ type: 'text', text: message.content });
  }

  if (!withAttachment || !Array.isArray(message.attachments)) return contents;

  for (const entry of message.attachments) {
    const normalized = await canonicalizePromptAttachment(entry, message);
    ensureAttachmentSupported(normalized, attachmentCapability);
    contents.push({
      type: normalized.kind,
      source: normalized.source,
    });
  }

  return contents;
}

export async function buildNativeRequest({
  model,
  messages,
  options = {},
  tools = {},
  withAttachment = true,
  attachmentCapability,
  include,
  reasoning,
  responseSchema,
  middleware,
}: BuildNativeRequestOptions): Promise<BuildNativeRequestResult> {
  const copiedMessages = messages.map(message => ({
    ...message,
    attachments: message.attachments
      ? [...message.attachments]
      : message.attachments,
  }));

  const systemMessage =
    copiedMessages[0]?.role === 'system' ? copiedMessages.shift() : undefined;
  const schema = resolveResponseSchema(systemMessage, responseSchema);

  const coreMessages: NativeLlmCoreMessage[] = [];
  if (systemMessage?.content?.length) {
    coreMessages.push({
      role: 'system',
      content: [{ type: 'text', text: systemMessage.content }],
    });
  }

  for (const message of copiedMessages) {
    if (message.role === 'system') continue;
    const content = await toCoreContents(
      message,
      withAttachment,
      attachmentCapability
    );
    coreMessages.push({ role: roleToCore(message.role), content });
  }

  return {
    request: {
      model,
      stream: true,
      messages: coreMessages,
      max_tokens: options.maxTokens ?? undefined,
      temperature: options.temperature ?? undefined,
      tools: ToolSchemaExtractor.extract(tools),
      tool_choice: Object.keys(tools).length ? 'auto' : undefined,
      include,
      reasoning,
      response_schema: schema
        ? ToolSchemaExtractor.toJsonSchema(schema)
        : undefined,
      middleware: middleware?.rust
        ? { request: middleware.rust.request, stream: middleware.rust.stream }
        : undefined,
    },
    schema,
  };
}

export async function buildNativeStructuredRequest({
  model,
  messages,
  options = {},
  withAttachment = true,
  attachmentCapability,
  reasoning,
  responseSchema,
  middleware,
}: Omit<
  BuildNativeRequestOptions,
  'tools' | 'include'
>): Promise<BuildNativeStructuredRequestResult> {
  const copiedMessages = messages.map(message => ({
    ...message,
    attachments: message.attachments
      ? [...message.attachments]
      : message.attachments,
  }));

  const systemMessage =
    copiedMessages[0]?.role === 'system' ? copiedMessages.shift() : undefined;
  const schema = resolveResponseSchema(systemMessage, responseSchema);
  const strict = resolveResponseStrict(systemMessage, options);

  if (!schema) {
    throw new CopilotPromptInvalid('Schema is required');
  }

  const coreMessages: NativeLlmCoreMessage[] = [];
  if (systemMessage?.content?.length) {
    coreMessages.push({
      role: 'system',
      content: [{ type: 'text', text: systemMessage.content }],
    });
  }

  for (const message of copiedMessages) {
    if (message.role === 'system') continue;
    const content = await toCoreContents(
      message,
      withAttachment,
      attachmentCapability
    );
    coreMessages.push({ role: roleToCore(message.role), content });
  }

  return {
    request: {
      model,
      messages: coreMessages,
      schema: ToolSchemaExtractor.toJsonSchema(schema),
      max_tokens: options.maxTokens ?? undefined,
      temperature: options.temperature ?? undefined,
      reasoning,
      strict,
      response_mime_type: 'application/json',
      middleware: middleware?.rust
        ? { request: middleware.rust.request }
        : undefined,
    },
    schema,
  };
}

export function buildNativeEmbeddingRequest({
  model,
  inputs,
  dimensions,
  taskType = 'RETRIEVAL_DOCUMENT',
}: {
  model: string;
  inputs: string[];
  dimensions?: number;
  taskType?: string;
}): NativeLlmEmbeddingRequest {
  return {
    model,
    inputs,
    dimensions,
    task_type: taskType,
  };
}

function ensureToolResultMeta(
  event: Extract<NativeLlmStreamEvent, { type: 'tool_result' }>,
  toolCalls: Map<string, ToolCallMeta>
): NormalizedToolResultEvent | null {
  const name = event.name ?? toolCalls.get(event.call_id)?.name;
  const args = event.arguments ?? toolCalls.get(event.call_id)?.args;

  if (!name || !args) return null;
  return { ...event, name, arguments: args };
}

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
  event: NormalizedToolResultEvent
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

function formatAttachmentFootnotes(attachments: AttachmentFootnote[]) {
  const references = attachments.map((_, index) => `[^${index + 1}]`).join('');
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

  return `\n\n${references}\n\n${definitions}`;
}

export class NativeProviderAdapter {
  readonly #loop: ToolCallLoop;
  readonly #enableCallout: boolean;
  readonly #enableCitationFootnote: boolean;

  constructor(
    dispatch: NativeDispatchFn,
    tools: CopilotToolSet,
    maxSteps = 20,
    options: NativeProviderAdapterOptions = {}
  ) {
    this.#loop = new ToolCallLoop(dispatch, tools, maxSteps);
    const enabledNodeTextMiddlewares = new Set(
      options.nodeTextMiddleware ?? ['citation_footnote', 'callout']
    );
    this.#enableCallout =
      enabledNodeTextMiddlewares.has('callout') ||
      enabledNodeTextMiddlewares.has('thinking_format');
    this.#enableCitationFootnote =
      enabledNodeTextMiddlewares.has('citation_footnote');
  }

  async text(
    request: NativeLlmRequest,
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
    request: NativeLlmRequest,
    signal?: AbortSignal,
    messages?: PromptMessage[]
  ): AsyncIterableIterator<string> {
    const textParser = this.#enableCallout ? new TextStreamParser() : null;
    const citationFormatter = this.#enableCitationFootnote
      ? new CitationFootnoteFormatter()
      : null;
    const toolCalls = new Map<string, ToolCallMeta>();
    let streamPartId = 0;

    for await (const event of this.#loop.run(request, signal, messages)) {
      switch (event.type) {
        case 'text_delta': {
          if (textParser) {
            yield textParser.parse({
              type: 'text-delta',
              id: String(streamPartId++),
              text: event.text,
            });
          } else {
            yield event.text;
          }
          break;
        }
        case 'reasoning_delta': {
          if (textParser) {
            yield textParser.parse({
              type: 'reasoning-delta',
              id: String(streamPartId++),
              text: event.text,
            });
          } else {
            yield event.text;
          }
          break;
        }
        case 'tool_call': {
          const toolCall = {
            name: event.name,
            args: event.arguments,
          };
          toolCalls.set(event.call_id, toolCall);
          if (textParser) {
            yield textParser.parse({
              type: 'tool-call',
              toolCallId: event.call_id,
              toolName: event.name as never,
              input: event.arguments,
            });
          }
          break;
        }
        case 'tool_result': {
          const normalized = ensureToolResultMeta(event, toolCalls);
          if (!normalized || !textParser) {
            break;
          }
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
            citationFormatter.consume({
              type: 'citation',
              index: event.index,
              url: event.url,
            });
          }
          break;
        }
        case 'done': {
          const footnotes = textParser?.end() ?? '';
          const citations = citationFormatter?.end() ?? '';
          const tails = [citations, footnotes].filter(Boolean).join('\n');
          if (tails) {
            yield `\n${tails}`;
          }
          break;
        }
        case 'error': {
          throw new Error(event.message);
        }
        default:
          break;
      }
    }
  }

  async *streamObject(
    request: NativeLlmRequest,
    signal?: AbortSignal,
    messages?: PromptMessage[]
  ): AsyncIterableIterator<StreamObject> {
    const toolCalls = new Map<string, ToolCallMeta>();
    const citationFormatter = this.#enableCitationFootnote
      ? new CitationFootnoteFormatter()
      : null;
    const fallbackAttachmentFootnotes = new Map<string, AttachmentFootnote>();
    let hasFootnoteReference = false;

    for await (const event of this.#loop.run(request, signal, messages)) {
      switch (event.type) {
        case 'text_delta': {
          if (event.text.includes('[^')) {
            hasFootnoteReference = true;
          }
          yield {
            type: 'text-delta',
            textDelta: event.text,
          };
          break;
        }
        case 'reasoning_delta': {
          yield {
            type: 'reasoning',
            textDelta: event.text,
          };
          break;
        }
        case 'tool_call': {
          const toolCall = {
            name: event.name,
            args: event.arguments,
          };
          toolCalls.set(event.call_id, toolCall);
          yield {
            type: 'tool-call',
            toolCallId: event.call_id,
            toolName: event.name,
            args: event.arguments,
          };
          break;
        }
        case 'tool_result': {
          const normalized = ensureToolResultMeta(event, toolCalls);
          if (!normalized) {
            break;
          }
          const attachments = collectAttachmentFootnotes(normalized);
          attachments.forEach(attachment => {
            fallbackAttachmentFootnotes.set(attachment.blobId, attachment);
          });
          yield {
            type: 'tool-result',
            toolCallId: normalized.call_id,
            toolName: normalized.name,
            args: normalized.arguments,
            result: normalized.output,
          };
          break;
        }
        case 'citation': {
          if (citationFormatter) {
            citationFormatter.consume({
              type: 'citation',
              index: event.index,
              url: event.url,
            });
          }
          break;
        }
        case 'done': {
          const citations = citationFormatter?.end() ?? '';
          if (citations) {
            hasFootnoteReference = true;
            yield {
              type: 'text-delta',
              textDelta: `\n${citations}`,
            };
          }
          if (!hasFootnoteReference && fallbackAttachmentFootnotes.size > 0) {
            yield {
              type: 'text-delta',
              textDelta: formatAttachmentFootnotes(
                Array.from(fallbackAttachmentFootnotes.values())
              ),
            };
          }
          break;
        }
        case 'error': {
          throw new Error(event.message);
        }
        default:
          break;
      }
    }
  }
}
