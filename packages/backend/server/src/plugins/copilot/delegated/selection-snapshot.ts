import type { EditorSelectionSnapshot } from '@affine/realtime';
import { z } from 'zod';

const id = z.string().min(1).max(128);
const text = z
  .object({ content: z.string().max(50_000), truncated: z.boolean() })
  .strict();
const block = z
  .object({
    id,
    flavour: z.string(),
    text,
    child_ids: id.array().max(200),
    child_ids_truncated: z.boolean(),
  })
  .strict();
const element = z
  .object({
    id,
    type: z.string(),
    text: text.optional(),
    title: text.optional(),
    child_ids: id.array().max(200).optional(),
  })
  .passthrough();
const view = z
  .object({
    editor_state_id: id,
    mode: z.enum(['page', 'edgeless']),
    content: z.string().max(50_000).optional(),
    truncated: z.boolean().optional(),
    block_ids: id.array().max(50).optional(),
    block_ids_truncated: z.boolean().optional(),
    blocks: block.array().max(50).optional(),
    elements: element.array().max(50).optional(),
    neighborhood: z.unknown().array().max(0).optional(),
  })
  .strict();

// These are the existing transport/read bounds, not new user policy settings.
const schema = z
  .object({
    version: z.literal(1),
    workspaceId: id,
    docId: id,
    readonly: z.boolean(),
    views: z.object({ text: view, markdown: view, structure: view }).strict(),
  })
  .strict()
  .superRefine((snapshot, ctx) => {
    const first = snapshot.views.text;
    for (const item of Object.values(snapshot.views)) {
      if (
        item.editor_state_id !== first.editor_state_id ||
        item.mode !== first.mode
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Selection views have different identities',
        });
      }
    }
    if (
      first.mode === 'page' &&
      (typeof first.content !== 'string' ||
        typeof snapshot.views.markdown.content !== 'string' ||
        !snapshot.views.structure.blocks)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Incomplete Page selection snapshot',
      });
    }
    if (
      first.mode === 'edgeless' &&
      Object.values(snapshot.views).some(item => !item.elements)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Incomplete Edgeless selection snapshot',
      });
    }
  });

export function parseEditorSelectionSnapshot(
  value: unknown
): EditorSelectionSnapshot | undefined {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
