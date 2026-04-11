import { Logger } from '@nestjs/common';
import { GoogleAuth, GoogleAuthOptions } from 'google-auth-library';
import z from 'zod';

import { OneMinute, safeFetch } from '../../../base';
import { PromptAttachment, StreamObject } from './types';

export type VertexProviderConfig = {
  location?: string;
  project?: string;
  baseURL?: string;
  googleAuthOptions?: GoogleAuthOptions;
  fetch?: typeof fetch;
};

export type VertexAnthropicProviderConfig = VertexProviderConfig;

type CopilotTextStreamPart =
  | { type: 'text-delta'; text: string; id?: string }
  | { type: 'reasoning-delta'; text: string; id?: string }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
      output: unknown;
    }
  | { type: 'error'; error: unknown };

const ATTACH_HEAD_PARAMS = { timeoutMs: OneMinute / 12, maxRedirects: 3 };
const FORMAT_INFER_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  opus: 'audio/opus',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  m4a: 'audio/aac',
  flac: 'audio/flac',
  ogv: 'video/ogg',
  wav: 'audio/wav',
  png: 'image/png',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  txt: 'text/plain',
  md: 'text/plain',
  mov: 'video/mov',
  mpeg: 'video/mpeg',
  mp4: 'video/mp4',
  avi: 'video/avi',
  wmv: 'video/wmv',
  flv: 'video/flv',
};

function toBase64Data(data: string, encoding: 'base64' | 'utf8' = 'base64') {
  return encoding === 'base64'
    ? data
    : Buffer.from(data, 'utf8').toString('base64');
}

export function promptAttachmentToUrl(
  attachment: PromptAttachment
): string | undefined {
  if (typeof attachment === 'string') return attachment;
  if ('attachment' in attachment) return attachment.attachment;
  switch (attachment.kind) {
    case 'url':
      return attachment.url;
    case 'data':
      return `data:${attachment.mimeType};base64,${toBase64Data(
        attachment.data,
        attachment.encoding
      )}`;
    case 'bytes':
      return `data:${attachment.mimeType};base64,${attachment.data}`;
    case 'file_handle':
      return;
  }
}

export function promptAttachmentMimeType(
  attachment: PromptAttachment,
  fallbackMimeType?: string
): string | undefined {
  if (typeof attachment === 'string') return fallbackMimeType;
  if ('attachment' in attachment) return attachment.mimeType;
  return attachment.mimeType ?? fallbackMimeType;
}

export async function inferMimeType(url: string) {
  if (url.startsWith('data:')) {
    return url.split(';')[0].split(':')[1];
  }
  const pathname = new URL(url).pathname;
  const extension = pathname.split('.').pop();
  if (extension) {
    const ext = FORMAT_INFER_MAP[extension];
    if (ext) {
      return ext;
    }
  }
  try {
    const mimeType = await safeFetch(
      url,
      { method: 'HEAD' },
      ATTACH_HEAD_PARAMS
    ).then(res => res.headers.get('content-type'));
    if (mimeType) return mimeType;
  } catch {
    // ignore and fallback to default
  }
  return 'application/octet-stream';
}

type CitationIndexedEvent = {
  type: 'citation';
  index: number;
  url: string;
};

export class CitationFootnoteFormatter {
  private readonly citations = new Map<number, string>();

  public consume(event: CitationIndexedEvent) {
    if (event.type !== 'citation') {
      return '';
    }
    this.citations.set(event.index, event.url);
    return '';
  }

  public end() {
    const footnotes = Array.from(this.citations.entries())
      .sort((a, b) => a[0] - b[0])
      .map(
        ([index, citation]) =>
          `[^${index}]: {"type":"url","url":"${encodeURIComponent(citation)}"}`
      );
    return footnotes.join('\n');
  }
}

type ChunkType = CopilotTextStreamPart['type'];

export function toError(error: unknown): Error {
  if (typeof error === 'string') {
    return new Error(error);
  } else if (error instanceof Error) {
    return error;
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  ) {
    return new Error(String(error.message));
  } else {
    return new Error(JSON.stringify(error));
  }
}

type DocEditFootnote = {
  intent: string;
  result: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export class TextStreamParser {
  private readonly logger = new Logger(TextStreamParser.name);
  private readonly CALLOUT_PREFIX = '\n[!]\n';

  private lastType: ChunkType | undefined;

  private prefix: string | null = this.CALLOUT_PREFIX;

  private readonly docEditFootnotes: DocEditFootnote[] = [];

  public parse(chunk: CopilotTextStreamPart) {
    let result = '';
    switch (chunk.type) {
      case 'text-delta': {
        if (!this.prefix) {
          this.resetPrefix();
        }
        result = chunk.text;
        result = this.addNewline(chunk.type, result);
        break;
      }
      case 'reasoning-delta': {
        result = chunk.text;
        result = this.addPrefix(result);
        result = this.markAsCallout(result);
        break;
      }
      case 'tool-call': {
        this.logger.debug(
          `[tool-call] toolName: ${chunk.toolName}, toolCallId: ${chunk.toolCallId}`
        );
        result = this.addPrefix(result);
        switch (chunk.toolName) {
          case 'conversation_summary': {
            result += `\nSummarizing context\n`;
            break;
          }
          case 'web_search_exa': {
            result += `\nSearching the web "${chunk.input.query}"\n`;
            break;
          }
          case 'web_crawl_exa': {
            result += `\nCrawling the web "${chunk.input.url}"\n`;
            break;
          }
          case 'doc_keyword_search': {
            result += `\nSearching the keyword "${chunk.input.query}"\n`;
            break;
          }
          case 'doc_read': {
            result += `\nReading the doc "${chunk.input.doc_id}"\n`;
            break;
          }
          case 'doc_compose': {
            result += `\nWriting document "${chunk.input.title}"\n`;
            break;
          }
          case 'doc_edit': {
            this.docEditFootnotes.push({
              intent: String(chunk.input.instructions ?? ''),
              result: '',
            });
            break;
          }
        }
        result = this.markAsCallout(result);
        break;
      }
      case 'tool-result': {
        this.logger.debug(
          `[tool-result] toolName: ${chunk.toolName}, toolCallId: ${chunk.toolCallId}`
        );
        result = this.addPrefix(result);
        switch (chunk.toolName) {
          case 'doc_edit': {
            const output = asRecord(chunk.output);
            const array = output?.result;
            if (Array.isArray(array)) {
              result += array
                .map(item => {
                  return `\n${String(asRecord(item)?.changedContent ?? '')}\n`;
                })
                .join('');
              this.docEditFootnotes[this.docEditFootnotes.length - 1].result =
                result;
            } else {
              this.docEditFootnotes.pop();
            }
            break;
          }
          case 'doc_semantic_search': {
            const output = chunk.output;
            if (Array.isArray(output)) {
              result += `\nFound ${output.length} document${output.length !== 1 ? 's' : ''} related to “${chunk.input.query}”.\n`;
            } else if (typeof output === 'string') {
              result += `\n${output}\n`;
            } else {
              const message = asRecord(output)?.message;
              this.logger.warn(
                `Unexpected result type for doc_semantic_search: ${
                  typeof message === 'string' ? message : 'Unknown error'
                }`
              );
            }
            break;
          }
          case 'doc_keyword_search': {
            const output = chunk.output;
            if (Array.isArray(output)) {
              result += `\nFound ${output.length} document${output.length !== 1 ? 's' : ''} related to “${chunk.input.query}”.\n`;
              result += `\n${this.getKeywordSearchLinks(output)}\n`;
            }
            break;
          }
          case 'doc_compose': {
            const output = asRecord(chunk.output);
            if (output && typeof output.title === 'string') {
              result += `\nDocument "${output.title}" created successfully with ${String(
                output.wordCount ?? 0
              )} words.\n`;
            }
            break;
          }
          case 'web_search_exa': {
            const output = chunk.output;
            if (Array.isArray(output)) {
              result += `\n${this.getWebSearchLinks(output)}\n`;
            }
            break;
          }
        }
        result = this.markAsCallout(result);
        break;
      }
      case 'error': {
        throw toError(chunk.error);
      }
    }
    this.lastType = chunk.type;
    return result;
  }

  public end() {
    const footnotes = this.docEditFootnotes.map((footnote, index) => {
      return `[^edit${index + 1}]: ${JSON.stringify({ type: 'doc-edit', ...footnote })}`;
    });
    return footnotes.join('\n');
  }

  private addPrefix(text: string) {
    if (this.prefix) {
      const result = this.prefix + text;
      this.prefix = null;
      return result;
    }
    return text;
  }

  private resetPrefix() {
    this.prefix = this.CALLOUT_PREFIX;
  }

  private addNewline(chunkType: ChunkType, result: string) {
    if (this.lastType && this.lastType !== chunkType) {
      return '\n\n' + result;
    }
    return result;
  }

  private markAsCallout(text: string) {
    return text.replaceAll('\n', '\n> ');
  }

  private getWebSearchLinks(
    list: {
      title: string | null;
      url: string;
    }[]
  ): string {
    const links = list.reduce((acc, result) => {
      return acc + `\n\n[${result.title ?? result.url}](${result.url})\n\n`;
    }, '');
    return links;
  }

  private getKeywordSearchLinks(
    list: {
      docId: string;
      title: string;
    }[]
  ): string {
    const links = list.reduce((acc, result) => {
      return acc + `\n\n[${result.title}](${result.docId})\n\n`;
    }, '');
    return links;
  }
}

export class StreamObjectParser {
  public parse(chunk: CopilotTextStreamPart) {
    switch (chunk.type) {
      case 'reasoning-delta': {
        return { type: 'reasoning' as const, textDelta: chunk.text };
      }
      case 'text-delta': {
        const { type, text: textDelta } = chunk;
        return { type, textDelta };
      }
      case 'tool-call':
      case 'tool-result': {
        const { type, toolCallId, toolName, input: args } = chunk;
        const result = 'output' in chunk ? chunk.output : undefined;
        return { type, toolCallId, toolName, args, result } as StreamObject;
      }
      case 'error': {
        throw toError(chunk.error);
      }
      default: {
        return null;
      }
    }
  }

  public mergeTextDelta(chunks: StreamObject[]): StreamObject[] {
    return chunks.reduce((acc, curr) => {
      const prev = acc.at(-1);
      switch (curr.type) {
        case 'reasoning':
        case 'text-delta': {
          if (prev && prev.type === curr.type) {
            prev.textDelta += curr.textDelta;
          } else {
            acc.push(curr);
          }
          break;
        }
        case 'tool-result': {
          const index = acc.findIndex(
            item =>
              item.type === 'tool-call' &&
              item.toolCallId === curr.toolCallId &&
              item.toolName === curr.toolName
          );
          if (index !== -1) {
            acc[index] = curr;
          } else {
            acc.push(curr);
          }
          break;
        }
        default: {
          acc.push(curr);
          break;
        }
      }
      return acc;
    }, [] as StreamObject[]);
  }

  public mergeContent(chunks: StreamObject[]): string {
    return chunks.reduce((acc, curr) => {
      if (curr.type === 'text-delta') {
        acc += curr.textDelta;
      }
      return acc;
    }, '');
  }
}

export const VertexModelListSchema = z.object({
  publisherModels: z.array(
    z.object({
      name: z.string(),
      versionId: z.string(),
    })
  ),
});

function normalizeUrl(baseURL?: string) {
  if (!baseURL?.trim()) {
    return undefined;
  }
  try {
    const url = new URL(baseURL);
    const serialized = url.toString();
    if (serialized.endsWith('/')) return serialized.slice(0, -1);
    return serialized;
  } catch {
    return undefined;
  }
}

export function getVertexAnthropicBaseUrl(options: VertexProviderConfig) {
  const normalizedBaseUrl = normalizeUrl(options.baseURL);
  if (normalizedBaseUrl) return normalizedBaseUrl;
  const { location, project } = options;
  if (!location || !project) return undefined;
  return `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/anthropic`;
}

export async function getGoogleAuth(
  options: VertexProviderConfig,
  publisher: 'anthropic' | 'google'
) {
  function getBaseUrl() {
    const normalizedBaseUrl = normalizeUrl(options.baseURL);
    if (normalizedBaseUrl) return normalizedBaseUrl;
    const { location } = options;
    if (location) {
      return `https://${location}-aiplatform.googleapis.com/v1beta1/publishers/${publisher}`;
    }
    return undefined;
  }

  async function generateAuthToken() {
    if (!options.googleAuthOptions) {
      return undefined;
    }
    const auth = new GoogleAuth({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      ...options.googleAuthOptions,
    });
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    return token.token;
  }

  const token = await generateAuthToken();

  return {
    baseUrl: getBaseUrl(),
    headers: () => ({ Authorization: `Bearer ${token}` }),
    fetch: options.fetch,
  };
}
