import { z } from 'zod';

export const KanbanViewTypeSchema = z.object({
  viewId: z.string(),
  type: z.literal('kanban'),
});
export const KanbanCellSelectionSchema = z.object({
  selectionType: z.literal('cell'),
  groupKey: z.string(),
  cardId: z.string(),
  columnId: z.string(),
  isEditing: z.boolean(),
});

const KanbanCardSelectionCardSchema = z.object({
  groupKey: z.string(),
  cardId: z.string(),
});
export const KanbanCardSelectionSchema = z.object({
  selectionType: z.literal('card'),
  cards: z
    .tuple([KanbanCardSelectionCardSchema])
    .rest(KanbanCardSelectionCardSchema),
});

export const KanbanGroupSelectionSchema = z.object({
  selectionType: z.literal('group'),
  groupKeys: z.tuple([z.string()]).rest(z.string()),
});

export const KanbanViewSelectionSchema = z.union([
  KanbanCellSelectionSchema,
  KanbanCardSelectionSchema,
  KanbanGroupSelectionSchema,
]);
export const KanbanViewSelectionWithTypeSchema = z.union([
  z.intersection(KanbanViewTypeSchema, KanbanCellSelectionSchema),
  z.intersection(KanbanViewTypeSchema, KanbanCardSelectionSchema),
  z.intersection(KanbanViewTypeSchema, KanbanGroupSelectionSchema),
]);
export type KanbanCellSelection = z.TypeOf<typeof KanbanCellSelectionSchema>;
export type KanbanCardSelectionCard = z.TypeOf<
  typeof KanbanCardSelectionCardSchema
>;
export type KanbanCardSelection = z.TypeOf<typeof KanbanCardSelectionSchema>;
export type KanbanGroupSelection = z.TypeOf<typeof KanbanGroupSelectionSchema>;
export type KanbanViewSelection = z.TypeOf<typeof KanbanViewSelectionSchema>;
export type KanbanViewSelectionWithType = z.TypeOf<
  typeof KanbanViewSelectionWithTypeSchema
>;
