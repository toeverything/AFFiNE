import { z } from 'zod';

export const workbenchViewIconNameSchema = z.enum([
  'trash',
  'allDocs',
  'collection',
  'tag',
  'doc', // refers to a doc whose mode is not yet being resolved
  'page',
  'edgeless',
  'journal',
]);

export const workbenchViewMetaSchema = z.object({
  id: z.string(),
  path: z
    .object({
      pathname: z.string().optional(),
      hash: z.string().optional(),
      search: z.string().optional(),
    })
    .optional(),
  // todo: move title/module to cached stated
  title: z.string().optional(),
  iconName: workbenchViewIconNameSchema.optional(),
});

export const workbenchMetaSchema = z.object({
  id: z.string(),
  activeViewIndex: z.number(),
  pinned: z.boolean().optional(),
  basename: z.string(),
  views: z.array(workbenchViewMetaSchema),
});

export const tabViewsMetaSchema = z.object({
  activeWorkbenchId: z.string().optional(),
  workbenches: z.array(workbenchMetaSchema).default([]),
});

export const TabViewsMetaKey = 'tabViewsMetaSchema';
export type TabViewsMetaSchema = z.infer<typeof tabViewsMetaSchema>;
export type WorkbenchMeta = z.infer<typeof workbenchMetaSchema>;
export type WorkbenchViewMeta = z.infer<typeof workbenchViewMetaSchema>;
export type WorkbenchViewModule = z.infer<typeof workbenchViewIconNameSchema>;
