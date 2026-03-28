import {
  GeneralNetworkError,
  RequestTimeoutError,
} from './error';

const REST_API_BASE_URL = 'http://localhost:1570';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
}

export interface ChatStreamOptions {
  signal?: AbortSignal;
  timeout?: number;
}

async function* parseSSEStream(
  response: Response,
  options: ChatStreamOptions = {}
): AsyncIterable<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new GeneralNetworkError('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  const timeout = options.timeout || 120000;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let timeoutRejected = false;

  const resetTimeout = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutRejected = true;
      reader.cancel();
    }, timeout);
  };

  resetTimeout();

  try {
    while (!timeoutRejected) {
      if (options.signal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();
      if (done || timeoutRejected) {
        break;
      }

      resetTimeout();
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('data: ')) {
          const data = trimmedLine.slice(6);
          if (data === '[DONE]') {
            return;
          }
          if (data) {
            yield data;
          }
        }
      }
    }

    if (buffer.trim()) {
      const trimmedLine = buffer.trim();
      if (trimmedLine.startsWith('data: ')) {
        const data = trimmedLine.slice(6);
        if (data !== '[DONE]' && data) {
          yield data;
        }
      }
    }

    if (timeoutRejected) {
      throw new RequestTimeoutError();
    }
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    reader.releaseLock();
  }
}

export async function chatStream(
  request: ChatRequest,
  options: ChatStreamOptions = {}
): Promise<AsyncIterable<string>> {
  let response: Response;
  try {
    response = await fetch(`${REST_API_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify(request),
      signal: options.signal,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw err;
    }
    if (err.name === 'TypeError' && err.message?.includes('Failed to fetch')) {
      throw new GeneralNetworkError(
        `Network error: Cannot connect to ${REST_API_BASE_URL}. Please check if the server is running and CORS is enabled.`
      );
    }
    throw new GeneralNetworkError(err.message || 'Unknown network error');
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    if (response.status === 401) {
      throw new GeneralNetworkError('Unauthorized: Please login first');
    }
    if (response.status === 402) {
      throw new GeneralNetworkError('Payment required: Quota exceeded');
    }
    if (response.status === 429) {
      throw new GeneralNetworkError('Too many requests: Please try again later');
    }
    throw new GeneralNetworkError(
      `HTTP error ${response.status}: ${errorText || response.statusText}`
    );
  }

  return parseSSEStream(response, options);
}

export type TextStream = AsyncIterable<string>;

export interface RestTextToTextOptions {
  content: string;
  systemPrompt?: string;
  model?: string;
  stream?: boolean;
  signal?: AbortSignal;
  timeout?: number;
}

export function restTextToText({
  content,
  systemPrompt,
  model = 'qwen',
  stream = true,
  signal,
  timeout,
}: RestTextToTextOptions): TextStream {
  const messages: ChatMessage[] = [];

  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt,
    });
  }

  messages.push({
    role: 'user',
    content,
  });

  return {
    [Symbol.asyncIterator]: async function* () {
      const result = await chatStream(
        {
          model,
          messages,
        },
        {
          signal,
          timeout,
        }
      );

      for await (const chunk of result) {
        yield chunk;
      }
    },
  };
}
