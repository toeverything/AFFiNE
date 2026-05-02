import serverNativeModule from '@affine/server-native';
import { z } from 'zod';

import type { LlmToolLoopStreamEvent } from '../../../../native';

// Owner: Node compatibility helpers.
// JsonValue/NonEmptyString support host Zod schemas; ToolLoopStreamEvent is
// validated by the native/runtime contract via llmValidateContract().
const JsonPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    JsonPrimitiveSchema,
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ])
);

export const JsonObjectSchema = z.record(JsonValueSchema);

export const NonEmptyStringSchema = z.string().trim().min(1);

export const ToolDefinitionBaseSchema = z
  .object({
    name: NonEmptyStringSchema,
    description: z.string().optional(),
    parameters: JsonObjectSchema,
  })
  .strict();

export type ToolLoopStreamEvent = LlmToolLoopStreamEvent;

export function parseToolLoopStreamEvent(value: unknown) {
  return serverNativeModule.llmValidateContract(
    'toolLoopEvent',
    value
  ) as LlmToolLoopStreamEvent;
}
