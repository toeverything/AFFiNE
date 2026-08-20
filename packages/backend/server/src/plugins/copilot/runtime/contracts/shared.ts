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

export const ScopeSelectorSchema = z
  .object({
    kind: z.enum(['document', 'tag', 'collection', 'favorite', 'artifact']),
    id: NonEmptyStringSchema,
    name: z.string().optional(),
    source: z.enum(['draft', 'focus', 'message']),
  })
  .strict();

export const ScopeSelectorsSchema = ScopeSelectorSchema.array().max(100);

export const ClientScopeSelectorSchema = ScopeSelectorSchema.omit({
  kind: true,
  source: true,
}).extend({
  kind: z.enum(['document', 'tag', 'collection', 'favorite']),
});

export const RetrievalScopeSchema = z
  .object({
    mode: z.enum(['workspace', 'required']),
    requiredDocIds: z.array(z.string()),
    requiredArtifactIds: z.array(z.string()),
    preferredSourceIds: z.array(z.string()),
  })
  .strict();

export const TurnScopeSnapshotSchema = z
  .object({
    version: z.number().int().positive(),
    resolvedAt: z.string(),
    selectors: ScopeSelectorsSchema,
    requiredDocIds: z.array(z.string()),
    requiredArtifactIds: z.array(z.string()),
    preferredSourceIds: z.array(z.string()),
    retrieval: RetrievalScopeSchema,
  })
  .strict();

export const SessionFocusSchema = z
  .object({
    selectors: ScopeSelectorsSchema,
  })
  .strict();

export type ScopeSelector = z.infer<typeof ScopeSelectorSchema>;
export type TurnScopeSnapshot = z.infer<typeof TurnScopeSnapshotSchema>;
export type SessionFocus = z.infer<typeof SessionFocusSchema>;

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
