import { z } from 'zod';

export const workbenchViewModuleSchema = z.enum([
  'trash',
  'all',
  'collection',
  'tag',
  'doc',
  'journal',
]);

export const workbenchViewMetaSchema = z.object({
  id: z.string(),
  path: z
    .object({
      pathname: z.string(),
      hash: z.string().optional(),
      search: z.string().optional(),
    })
    .optional(),
  // todo: move title/module to cached stated
  title: z.string().optional(),
  moduleName: workbenchViewModuleSchema.optional(),
});

export const workbenchMetaSchema = z.object({
  key: z.string(),
  activeViewIndex: z.number(),
  pinned: z.boolean().optional(),
  basename: z.string(),
  views: z.array(workbenchViewMetaSchema),
});

export const tabViewsMetaSchema = z.object({
  activeWorkbenchKey: z.string().optional(),
  workbenches: z.array(workbenchMetaSchema).default([]),
});

export const TabViewsMetaKey = 'tabViewsMetaSchema';
export type TabViewsMetaSchema = z.infer<typeof tabViewsMetaSchema>;
export type WorkbenchMeta = z.infer<typeof workbenchMetaSchema>;
export type WorkbenchViewMeta = z.infer<typeof workbenchViewMetaSchema>;
export type WorkbenchViewModule = z.infer<typeof workbenchViewModuleSchema>;
