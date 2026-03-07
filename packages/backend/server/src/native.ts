import serverNativeModule, { type Tokenizer } from '@affine/server-native';

export const mergeUpdatesInApplyWay = serverNativeModule.mergeUpdatesInApplyWay;

export const verifyChallengeResponse = async (
  response: any,
  bits: number,
  resource: string
) => {
  if (typeof response !== 'string' || !response || !resource) return false;
  return serverNativeModule.verifyChallengeResponse(response, bits, resource);
};

export const mintChallengeResponse = async (resource: string, bits: number) => {
  if (!resource) return null;
  return serverNativeModule.mintChallengeResponse(resource, bits);
};

const ENCODER_CACHE = new Map<string, Tokenizer>();

export function getTokenEncoder(model?: string | null): Tokenizer | null {
  if (!model) return null;
  const cached = ENCODER_CACHE.get(model);
  if (cached) return cached;
  if (model.startsWith('gpt')) {
    const encoder = serverNativeModule.fromModelName(model);
    if (encoder) ENCODER_CACHE.set(model, encoder);
    return encoder;
  } else if (model.startsWith('dall')) {
    // dalle don't need to calc the token
    return null;
  } else {
    // c100k based model
    const encoder = serverNativeModule.fromModelName('gpt-4');
    if (encoder) ENCODER_CACHE.set('gpt-4', encoder);
    return encoder;
  }
}

export const getMime = serverNativeModule.getMime;
export const parseDoc = serverNativeModule.parseDoc;
export const htmlSanitize = serverNativeModule.htmlSanitize;
export const processImage = serverNativeModule.processImage;
export const parseYDocFromBinary = serverNativeModule.parseDocFromBinary;
export const parseYDocToMarkdown = serverNativeModule.parseDocToMarkdown;
export const parsePageDocFromBinary = serverNativeModule.parsePageDoc;
export const parseWorkspaceDocFromBinary = serverNativeModule.parseWorkspaceDoc;
export const readAllDocIdsFromRootDoc =
  serverNativeModule.readAllDocIdsFromRootDoc;
export const AFFINE_PRO_PUBLIC_KEY = serverNativeModule.AFFINE_PRO_PUBLIC_KEY;
export const AFFINE_PRO_LICENSE_AES_KEY =
  serverNativeModule.AFFINE_PRO_LICENSE_AES_KEY;

// MCP write tools exports
export const createDocWithMarkdown = serverNativeModule.createDocWithMarkdown;
export const updateDocWithMarkdown = serverNativeModule.updateDocWithMarkdown;
export const addDocToRootDoc = serverNativeModule.addDocToRootDoc;
export const updateDocTitle = serverNativeModule.updateDocTitle;
export const updateDocProperties = serverNativeModule.updateDocProperties;
export const updateRootDocMetaTitle = serverNativeModule.updateRootDocMetaTitle;

type NativeLlmModule = {
  llmDispatch?: (
    protocol: string,
    backendConfigJson: string,
    requestJson: string
  ) => string | Promise<string>;
  llmDispatchStream?: (
    protocol: string,
    backendConfigJson: string,
    requestJson: string,
    callback: (error: Error | null, eventJson: string) => void
  ) => { abort?: () => void } | undefined;
};

const nativeLlmModule = serverNativeModule as typeof serverNativeModule &
  NativeLlmModule;

export type NativeLlmProtocol =
  | 'openai_chat'
  | 'openai_responses'
  | 'anthropic';

export type NativeLlmBackendConfig = {
  base_url: string;
  auth_token: string;
  request_layer?: 'anthropic' | 'chat_completions' | 'responses' | 'vertex';
  headers?: Record<string, string>;
  no_streaming?: boolean;
  timeout_ms?: number;
};

export type NativeLlmCoreRole = 'system' | 'user' | 'assistant' | 'tool';

export type NativeLlmCoreContent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string; signature?: string }
  | {
      type: 'tool_call';
      call_id: string;
      name: string;
      arguments: Record<string, unknown>;
      thought?: string;
    }
  | {
      type: 'tool_result';
      call_id: string;
      output: unknown;
      is_error?: boolean;
      name?: string;
      arguments?: Record<string, unknown>;
    }
  | { type: 'image'; source: Record<string, unknown> | string };

export type NativeLlmCoreMessage = {
  role: NativeLlmCoreRole;
  content: NativeLlmCoreContent[];
};

export type NativeLlmToolDefinition = {
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
};

export type NativeLlmRequest = {
  model: string;
  messages: NativeLlmCoreMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  tools?: NativeLlmToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required' | { name: string };
  include?: string[];
  reasoning?: Record<string, unknown>;
  middleware?: {
    request?: Array<
      'normalize_messages' | 'clamp_max_tokens' | 'tool_schema_rewrite'
    >;
    stream?: Array<'stream_event_normalize' | 'citation_indexing'>;
    config?: {
      no_additional_properties?: boolean;
      drop_property_format?: boolean;
      drop_property_min_length?: boolean;
      drop_array_min_items?: boolean;
      drop_array_max_items?: boolean;
      max_tokens_cap?: number;
    };
  };
};

export type NativeLlmDispatchResponse = {
  id: string;
  model: string;
  message: NativeLlmCoreMessage;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cached_tokens?: number;
  };
  finish_reason: string;
  reasoning_details?: unknown;
};

export type NativeLlmStreamEvent =
  | { type: 'message_start'; id?: string; model?: string }
  | { type: 'text_delta'; text: string }
  | { type: 'reasoning_delta'; text: string }
  | {
      type: 'tool_call_delta';
      call_id: string;
      name?: string;
      arguments_delta: string;
    }
  | {
      type: 'tool_call';
      call_id: string;
      name: string;
      arguments: Record<string, unknown>;
      thought?: string;
    }
  | {
      type: 'tool_result';
      call_id: string;
      output: unknown;
      is_error?: boolean;
      name?: string;
      arguments?: Record<string, unknown>;
    }
  | { type: 'citation'; index: number; url: string }
  | {
      type: 'usage';
      usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        cached_tokens?: number;
      };
    }
  | {
      type: 'done';
      finish_reason?: string;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
        cached_tokens?: number;
      };
    }
  | { type: 'error'; message: string; code?: string; raw?: string };
const LLM_STREAM_END_MARKER = '__AFFINE_LLM_STREAM_END__';

export async function llmDispatch(
  protocol: NativeLlmProtocol,
  backendConfig: NativeLlmBackendConfig,
  request: NativeLlmRequest
): Promise<NativeLlmDispatchResponse> {
  if (!nativeLlmModule.llmDispatch) {
    throw new Error('native llm dispatch is not available');
  }
  const response = nativeLlmModule.llmDispatch(
    protocol,
    JSON.stringify(backendConfig),
    JSON.stringify(request)
  );
  const responseText = await Promise.resolve(response);
  return JSON.parse(responseText) as NativeLlmDispatchResponse;
}

export class NativeStreamAdapter<T> implements AsyncIterableIterator<T> {
  readonly #queue: T[] = [];
  readonly #waiters: ((result: IteratorResult<T>) => void)[] = [];
  readonly #handle: { abort?: () => void } | undefined;
  readonly #signal?: AbortSignal;
  readonly #abortListener?: () => void;
  #ended = false;

  constructor(
    handle: { abort?: () => void } | undefined,
    signal?: AbortSignal
  ) {
    this.#handle = handle;
    this.#signal = signal;

    if (signal?.aborted) {
      this.close(true);
      return;
    }

    if (signal) {
      this.#abortListener = () => {
        this.close(true);
      };
      signal.addEventListener('abort', this.#abortListener, { once: true });
    }
  }

  private close(abortHandle: boolean) {
    if (this.#ended) {
      return;
    }

    this.#ended = true;
    if (this.#signal && this.#abortListener) {
      this.#signal.removeEventListener('abort', this.#abortListener);
    }
    if (abortHandle) {
      this.#handle?.abort?.();
    }

    while (this.#waiters.length) {
      const waiter = this.#waiters.shift();
      waiter?.({ value: undefined as T, done: true });
    }
  }

  push(value: T | null) {
    if (this.#ended) {
      return;
    }

    if (value === null) {
      this.close(false);
      return;
    }

    const waiter = this.#waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
      return;
    }

    this.#queue.push(value);
  }

  [Symbol.asyncIterator]() {
    return this;
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.#queue.length > 0) {
      const value = this.#queue.shift() as T;
      return { value, done: false };
    }

    if (this.#ended) {
      return { value: undefined as T, done: true };
    }

    return await new Promise(resolve => {
      this.#waiters.push(resolve);
    });
  }

  async return(): Promise<IteratorResult<T>> {
    this.close(true);

    return { value: undefined as T, done: true };
  }
}

export function llmDispatchStream(
  protocol: NativeLlmProtocol,
  backendConfig: NativeLlmBackendConfig,
  request: NativeLlmRequest,
  signal?: AbortSignal
): AsyncIterableIterator<NativeLlmStreamEvent> {
  if (!nativeLlmModule.llmDispatchStream) {
    throw new Error('native llm stream dispatch is not available');
  }

  let adapter: NativeStreamAdapter<NativeLlmStreamEvent> | undefined;
  const buffer: (NativeLlmStreamEvent | null)[] = [];
  let pushFn = (event: NativeLlmStreamEvent | null) => {
    buffer.push(event);
  };
  const handle = nativeLlmModule.llmDispatchStream(
    protocol,
    JSON.stringify(backendConfig),
    JSON.stringify(request),
    (error, eventJson) => {
      if (error) {
        pushFn({ type: 'error', message: error.message, raw: eventJson });
        return;
      }
      if (eventJson === LLM_STREAM_END_MARKER) {
        pushFn(null);
        return;
      }
      try {
        pushFn(JSON.parse(eventJson) as NativeLlmStreamEvent);
      } catch (error) {
        pushFn({
          type: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'failed to parse native stream event',
          raw: eventJson,
        });
      }
    }
  );
  adapter = new NativeStreamAdapter(handle, signal);
  pushFn = event => {
    adapter.push(event);
  };
  for (const event of buffer) {
    adapter.push(event);
  }
  return adapter;
}
