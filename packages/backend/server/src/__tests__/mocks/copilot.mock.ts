import serverNativeModule from '@affine/server-native';

import { EMBEDDING_DIMENSIONS } from '../../models';

const STREAM_END = '__AFFINE_COPILOT_STREAM_END__';
const TEXT = 'generate text to text';
const STREAM_TEXT = 'generate text to text stream';

function structuredValue(schema: unknown, key?: string): unknown {
  if (!schema || typeof schema !== 'object') return TEXT;
  const value = schema as Record<string, unknown>;
  if (Array.isArray(value.enum)) return value.enum[0];
  if (Array.isArray(value.anyOf)) return structuredValue(value.anyOf[0], key);
  if (Array.isArray(value.oneOf)) return structuredValue(value.oneOf[0], key);
  if (value.type === 'object') {
    return Object.fromEntries(
      Object.entries((value.properties as Record<string, unknown>) ?? {}).map(
        ([name, property]) => [name, structuredValue(property, name)]
      )
    );
  }
  if (value.type === 'array') return [structuredValue(value.items, key)];
  if (value.type === 'boolean') return true;
  if (value.type === 'number' || value.type === 'integer') return 1;
  if (key === 'title') return 'Weekly Sync';
  if (key === 'speaker' || key === 'a') return 'A';
  if (key === 'text' || key === 'transcription' || key === 't') {
    return 'Hello, everyone.';
  }
  return TEXT;
}

function executionResult(input: { slot: string; request: unknown }) {
  const request = input.request as Record<string, unknown>;
  let result: unknown;
  if (input.slot === 'index.embedding') {
    const inputs = request.inputs as unknown[];
    const dimensions =
      (request.dimensions as number | undefined) ?? EMBEDDING_DIMENSIONS;
    result = {
      embeddings: inputs.map(() =>
        Array.from({ length: dimensions }, (_, index) => index + 1)
      ),
    };
  } else if (input.slot === 'search.rerank') {
    const candidates = request.candidates as unknown[];
    result = {
      scores: candidates.map((_, index) => candidates.length - index),
    };
  } else if (input.slot === 'image.generate') {
    result = {
      images: [
        {
          data_base64: Buffer.from('generated image').toString('base64'),
          media_type: 'image/jpeg',
        },
      ],
    };
  } else if (input.slot.includes('structured')) {
    const outputJson = structuredValue(request.schema);
    result = {
      output_json: outputJson,
      output_text: JSON.stringify(outputJson),
    };
  } else {
    result = { output_text: TEXT };
  }
  return JSON.stringify({ events: [], result });
}

export function installMockCopilotRuntime() {
  const prototype = serverNativeModule.BackendRuntime.prototype;
  const execute = prototype.executeCopilot;
  const stream = prototype.executeCopilotStream;
  prototype.executeCopilot = async input => executionResult(input);
  prototype.executeCopilotStream = async (
    _input,
    _maxSteps,
    callback,
    _toolCallback
  ) => {
    callback(null, JSON.stringify({ type: 'message_start', model: 'test' }));
    for (const text of STREAM_TEXT) {
      callback(null, JSON.stringify({ type: 'text_delta', text }));
    }
    callback(
      null,
      JSON.stringify({
        type: 'done',
        finish_reason: 'stop',
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    );
    callback(null, STREAM_END);
    return { abort() {} };
  };
  return () => {
    prototype.executeCopilot = execute;
    prototype.executeCopilotStream = stream;
  };
}
