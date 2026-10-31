import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

/**
 * A reference to a real `affine:note` block — `{refDocId, refBlockId}`,
 * mirroring every other reference mechanism in this codebase (Done date's
 * own shape is a plain value; this follows `note-ref`'s own `NoteRefProps`
 * shape instead, since it must identify a specific block, not just a doc).
 * Deliberately NOT a synced copy of the note's own text content — see
 * Story 2.6's own Resolved Design Decision 1 for the full reasoning.
 */
export const noteRefValueSchema = zod
  .object({
    refDocId: zod.string(),
    refBlockId: zod.string(),
  })
  .optional();

export type NoteRefValue = zod.infer<typeof noteRefValueSchema>;

export const notePropertyType = propertyType('note');
export const notePropertyModelConfig = notePropertyType.modelConfig({
  name: 'Note',
  propertyData: {
    schema: zod.object({}),
    default: () => ({}),
  },
  jsonValue: {
    schema: noteRefValueSchema,
    // No meaningful text representation for a block reference — `unknown`
    // is the same fallback `link`'s own doc-reference case effectively
    // resolves to once it stops being a literal string.
    type: () => t.unknown.instance(),
    isEmpty: ({ value }) => !value?.refDocId || !value.refBlockId,
  },
  rawValue: {
    schema: noteRefValueSchema,
    default: () => undefined,
    toString: ({ value }) =>
      value ? `${value.refDocId}:${value.refBlockId}` : '',
    // Not meaningfully settable by pasting plain text — a reference can only
    // be created via the cell's own create/attach actions, never by typing.
    fromString: () => ({ value: undefined }),
    toJson: ({ value }) => value,
    fromJson: ({ value }) => {
      const parsed = noteRefValueSchema.safeParse(value);
      return parsed.success ? parsed.data : undefined;
    },
  },
});
