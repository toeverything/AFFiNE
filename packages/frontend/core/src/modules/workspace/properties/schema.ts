import { z } from 'zod';

// ===== workspace-wide page property schema =====
export const TagOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

export type TagOption = z.infer<typeof TagOptionSchema>;

export enum PageSystemPropertyId {
  Tags = 'tags',
  Journal = 'journal',
}

export enum PagePropertyType {
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Date = 'date',
  Tags = 'tags',
}

export const PagePropertyMetaBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  type: z.string(),
});

export const PageSystemPropertyMetaBaseSchema =
  PagePropertyMetaBaseSchema.extend({
    source: z.literal('system'),
  });

export const PageCustomPropertyMetaSchema = PagePropertyMetaBaseSchema.extend({
  source: z.literal('custom'),
  type: z.nativeEnum(PagePropertyType),
});

// ====== page info schema ======
export const PageInfoItemSchema = z.object({
  id: z.string(), // property id. Maps to PagePropertyMetaSchema.id
  hidden: z.boolean().optional(),
  value: z.any(), // corresponds to PagePropertyMetaSchema.type
});

export const PageInfoJournalItemSchema = PageInfoItemSchema.extend({
  id: z.literal(PageSystemPropertyId.Journal),
  value: z.union([z.string(), z.literal(false)]),
});

export const PageInfoTagsItemSchema = PageInfoItemSchema.extend({
  id: z.literal(PageSystemPropertyId.Tags),
  value: z.array(z.string()),
});

// ====== workspace properties schema ======
export const WorkspaceFavoriteItemSchema = z.object({
  id: z.string(),
  order: z.number(),
  type: z.enum(['page', 'collection']),
});

export type WorkspaceFavoriteItem = z.infer<typeof WorkspaceFavoriteItemSchema>;

const WorkspaceAffinePropertiesSchemaSchema = z.object({
  pageProperties: z.object({
    custom: z.record(PageCustomPropertyMetaSchema),
    system: z.object({
      [PageSystemPropertyId.Journal]: PageSystemPropertyMetaBaseSchema.extend({
        id: z.literal(PageSystemPropertyId.Journal),
        type: z.literal(PagePropertyType.Date),
      }),
      [PageSystemPropertyId.Tags]: PagePropertyMetaBaseSchema.extend({
        id: z.literal(PageSystemPropertyId.Tags),
        type: z.literal(PagePropertyType.Tags),
        options: z.array(TagOptionSchema),
      }),
    }),
  }),
});

const WorkspacePagePropertiesSchema = z.object({
  custom: z.record(PageInfoItemSchema.extend({ order: z.number() })),
  system: z.object({
    [PageSystemPropertyId.Journal]: PageInfoJournalItemSchema,
    [PageSystemPropertyId.Tags]: PageInfoTagsItemSchema,
  }),
});

export const WorkspaceAffinePropertiesSchema = z.object({
  schema: WorkspaceAffinePropertiesSchemaSchema,
  favouriates: z.record(WorkspaceFavoriteItemSchema),
  pageProperties: z.record(WorkspacePagePropertiesSchema),
});

export type WorkspaceAffineProperties = z.infer<
  typeof WorkspaceAffinePropertiesSchema
>;
