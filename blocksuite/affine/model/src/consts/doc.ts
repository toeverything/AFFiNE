import type { SerializedXYWH } from '@blocksuite/global/gfx';
import { z } from 'zod';

export type DocMode = 'edgeless' | 'page';

export const DocModes = ['edgeless', 'page'] as const;

export type FootNoteReferenceType = 'doc' | 'attachment' | 'url';

export const FootNoteReferenceTypes = ['doc', 'attachment', 'url'] as const;

/**
 * Custom title and description information.
 *
 * Supports the following blocks:
 *
 * 1. Inline View: `AffineReference` - title
 * 2. Card View: `EmbedLinkedDocBlock` - title & description
 * 3. Embed View: `EmbedSyncedDocBlock` - title
 */
export const AliasInfoSchema = z
  .object({
    title: z.string(),
    description: z.string(),
  })
  .partial();

export type AliasInfo = z.infer<typeof AliasInfoSchema>;

export const SerializedXYWHSchema = z.custom<SerializedXYWH>(val => {
  if (typeof val !== 'string') return false;
  const match = val.match(/^\[(\d+),(\d+),(\d+),(\d+)\]$/);
  if (!match) return false;
  // Ensure all numbers are valid
  return match.slice(1).every(num => !isNaN(Number(num)));
}, 'Invalid XYWH format. Expected [number,number,number,number]');

export const ReferenceParamsSchema = z
  .object({
    mode: z.enum(DocModes),
    blockIds: z.string().array(),
    elementIds: z.string().array(),
    databaseId: z.string().optional(),
    databaseRowId: z.string().optional(),
    xywh: SerializedXYWHSchema.optional(),
    commentId: z.string().optional(),
  })
  .partial();

export type ReferenceParams = z.infer<typeof ReferenceParamsSchema>;

export const ReferenceInfoSchema = z
  .object({
    pageId: z.string(),
    params: ReferenceParamsSchema.optional(),
  })
  .merge(AliasInfoSchema);

export type ReferenceInfo = z.infer<typeof ReferenceInfoSchema>;

/**
 * FootNoteReferenceParamsSchema is used to define the parameters for a footnote reference.
 * It supports the following types:
 * 1. docId: string - the id of the doc
 * 2. blobId: string - the id of the attachment
 * 3. url: string - the url of the reference
 * 4. fileName: string - the name of the attachment
 * 5. fileType: string - the type of the attachment
 * 6. favicon: string - the favicon of the url reference
 * 7. title: string - the title of the url reference
 * 8. description: string - the description of the url reference
 */
export const FootNoteReferenceParamsSchema = z.object({
  type: z.enum(FootNoteReferenceTypes),
  docId: z.string().optional(),
  blobId: z.string().optional(),
  fileName: z.string().optional(),
  fileType: z.string().optional(),
  url: z.string().optional(),
  favicon: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
});

export type FootNoteReferenceParams = z.infer<
  typeof FootNoteReferenceParamsSchema
>;

export const FootNoteSchema = z.object({
  label: z.string(),
  reference: FootNoteReferenceParamsSchema,
});

export type FootNote = z.infer<typeof FootNoteSchema>;
