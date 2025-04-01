import { z } from 'zod';

export const BlockSchema = z.object({
  workspace_id: z.string(),
  doc_id: z.string(),
  block_id: z.string().optional(),
  content: z.string(),
  flavour: z.string(),
  blob: z.string().optional(),
  ref_doc_id: z.union([z.string(), z.string().array()]).optional(),
  ref: z.union([z.string(), z.string().array()]).optional(),
  parent_flavour: z.string().optional(),
  parent_block_id: z.string().optional(),
  additional: z.string().optional(),
  markdown_preview: z.string().optional(),
  created_by_user_id: z.string(),
  updated_by_user_id: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type Block = z.input<typeof BlockSchema>;

export function getBlockUniqueId(block: Block) {
  return `${block.workspace_id}/${block.doc_id}/${block.flavour}/${block.block_id ?? ''}`;
}
