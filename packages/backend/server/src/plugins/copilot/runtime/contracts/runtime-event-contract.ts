import { z } from 'zod';

import { NonEmptyStringSchema, parseToolLoopStreamEvent } from './shared';

// Owner: app-facing stream projection.
// Native/runtime owns incoming tool-loop event validation; this file owns the
// GraphQL/SSE-facing stream object shape and projection helpers only.
export const TextDeltaStreamObjectSchema = z
  .object({
    type: z.literal('text-delta'),
    textDelta: z.string(),
  })
  .strict();

export const ReasoningStreamObjectSchema = z
  .object({
    type: z.literal('reasoning'),
    textDelta: z.string(),
  })
  .strict();

export const ToolCallStreamObjectSchema = z
  .object({
    type: z.literal('tool-call'),
    toolCallId: NonEmptyStringSchema,
    toolName: NonEmptyStringSchema,
    args: z.record(z.unknown()),
    rawArgumentsText: z.string().optional(),
    argumentParseError: z.string().optional(),
    thought: z.string().optional(),
  })
  .strict();

export const ToolResultStreamObjectSchema = z
  .object({
    type: z.literal('tool-result'),
    toolCallId: NonEmptyStringSchema,
    toolName: NonEmptyStringSchema,
    args: z.record(z.unknown()),
    result: z.unknown(),
    rawArgumentsText: z.string().optional(),
    argumentParseError: z.string().optional(),
  })
  .strict();

export const StreamObjectSchema = z.discriminatedUnion('type', [
  TextDeltaStreamObjectSchema,
  ReasoningStreamObjectSchema,
  ToolCallStreamObjectSchema,
  ToolResultStreamObjectSchema,
]);

export type StreamObject = z.infer<typeof StreamObjectSchema>;

export const ToolCallEventSchema = z
  .object({
    type: z.literal('tool_call'),
    toolCallId: NonEmptyStringSchema,
    toolName: NonEmptyStringSchema,
    args: z.record(z.unknown()),
    rawArgumentsText: z.string().optional(),
    argumentParseError: z.string().optional(),
    thought: z.string().optional(),
  })
  .strict();

export const ToolResultEventSchema = z
  .object({
    type: z.literal('tool_result'),
    toolCallId: NonEmptyStringSchema,
    toolName: NonEmptyStringSchema,
    args: z.record(z.unknown()),
    result: z.unknown(),
    rawArgumentsText: z.string().optional(),
    argumentParseError: z.string().optional(),
  })
  .strict();

export const ToolEventSchema = z.discriminatedUnion('type', [
  ToolCallEventSchema,
  ToolResultEventSchema,
]);

export type ToolEvent = z.infer<typeof ToolEventSchema>;

export function projectRuntimeEventToStreamObject(
  value: unknown
): StreamObject | null {
  const event = parseToolLoopStreamEvent(value);

  switch (event.type) {
    case 'text_delta': {
      return { type: 'text-delta', textDelta: event.text };
    }
    case 'reasoning_delta': {
      return { type: 'reasoning', textDelta: event.text };
    }
    case 'tool_call': {
      return {
        type: 'tool-call',
        toolCallId: event.call_id,
        toolName: event.name,
        args: event.arguments,
        rawArgumentsText: event.arguments_text,
        argumentParseError: event.arguments_error,
        thought: event.thought,
      };
    }
    case 'tool_result': {
      return {
        type: 'tool-result',
        toolCallId: event.call_id,
        toolName: event.name,
        args: event.arguments,
        result: event.output,
        rawArgumentsText: event.arguments_text,
        argumentParseError: event.arguments_error,
      };
    }
    default:
      return null;
  }
}

export function streamObjectToToolEvent(
  streamObject: StreamObject
): ToolEvent | undefined {
  switch (streamObject.type) {
    case 'tool-call':
      return {
        type: 'tool_call',
        toolCallId: streamObject.toolCallId,
        toolName: streamObject.toolName,
        args: streamObject.args,
        rawArgumentsText: streamObject.rawArgumentsText,
        argumentParseError: streamObject.argumentParseError,
        thought: streamObject.thought,
      };
    case 'tool-result':
      return {
        type: 'tool_result',
        toolCallId: streamObject.toolCallId,
        toolName: streamObject.toolName,
        args: streamObject.args,
        result: streamObject.result,
        rawArgumentsText: streamObject.rawArgumentsText,
        argumentParseError: streamObject.argumentParseError,
      };
    default:
      return;
  }
}

export function toolEventToStreamObject(event: ToolEvent): StreamObject {
  return event.type === 'tool_call'
    ? {
        type: 'tool-call',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        rawArgumentsText: event.rawArgumentsText,
        argumentParseError: event.argumentParseError,
        thought: event.thought,
      }
    : {
        type: 'tool-result',
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        args: event.args,
        result: event.result,
        rawArgumentsText: event.rawArgumentsText,
        argumentParseError: event.argumentParseError,
      };
}
