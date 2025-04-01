import { z } from 'zod';

export const DocSchema = z.object({
  workspace_id: z.string(),
  doc_id: z.string(),
  title: z.string(),
  summary: z.string(),
  journal: z.string().optional(),
  created_by_user_id: z.string(),
  updated_by_user_id: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type Doc = z.input<typeof DocSchema>;

export function getDocUniqueId(doc: Doc) {
  return `${doc.workspace_id}/${doc.doc_id}`;
}
