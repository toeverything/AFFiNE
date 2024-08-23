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
  Text = 'text',
  Number = 'number',
  Date = 'date',
  Progress = 'progress',
  Checkbox = 'checkbox',
  Tags = 'tags',
  CreatedBy = 'createdBy',
  UpdatedBy = 'updatedBy',
}

export const PagePropertyMetaBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  source: z.string(),
  type: z.nativeEnum(PagePropertyType),
  icon: z.string(),
  required: z.boolean().optional(),
  readonly: z.boolean().optional(),
});

export const PageSystemPropertyMetaBaseSchema =
  PagePropertyMetaBaseSchema.extend({
    source: z.literal('system'),
  });

export const PageCustomPropertyMetaSchema = PagePropertyMetaBaseSchema.extend({
  source: z.literal('custom'),
  order: z.number(),
});

// ====== page info schema ======
export const PageInfoItemSchema = z.object({
  id: z.string(), // property id. Maps to PagePropertyMetaSchema.id
  visibility: z.enum(['visible', 'hide', 'hide-if-empty']),
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

export type PageInfoTagsItem = z.infer<typeof PageInfoTagsItemSchema>;

// ====== workspace properties schema ======
export const WorkspaceFavoriteItemSchema = z.object({
  id: z.string(),
  order: z.string(),
  type: z.enum(['doc', 'collection']),
  value: z.boolean(),
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

const PageInfoCustomPropertyItemSchema = PageInfoItemSchema.extend({
  order: z.string(),
});

const WorkspacePagePropertiesSchema = z.object({
  custom: z.record(PageInfoCustomPropertyItemSchema),
  system: z.object({
    [PageSystemPropertyId.Journal]: PageInfoJournalItemSchema,
    [PageSystemPropertyId.Tags]: PageInfoTagsItemSchema,
  }),
});

export const WorkspaceAffinePropertiesSchema = z.object({
  schema: WorkspaceAffinePropertiesSchemaSchema.optional(),
  favorites: z.record(WorkspaceFavoriteItemSchema).optional(),
  pageProperties: z.record(WorkspacePagePropertiesSchema).optional(),
  favoritesMigrated: z.boolean().optional(),
});

export type PageInfoCustomPropertyMeta = z.infer<
  typeof PageCustomPropertyMetaSchema
>;

export type WorkspaceAffineProperties = z.infer<
  typeof WorkspaceAffinePropertiesSchema
>;

export type PageInfoCustomProperty = z.infer<
  typeof PageInfoCustomPropertyItemSchema
>;

export type WorkspaceAffinePageProperties = z.infer<
  typeof WorkspacePagePropertiesSchema
>;
