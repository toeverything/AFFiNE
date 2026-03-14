import { z } from 'zod';

export const GanttViewTypeSchema = z.object({
  viewId: z.string(),
  type: z.literal('gantt'),
});

export const GanttCellSelectionSchema = z.object({
  selectionType: z.literal('cell'),
  rowId: z.string(),
  columnId: z.string(),
  isEditing: z.boolean(),
});

export const GanttBarSelectionSchema = z.object({
  selectionType: z.literal('bar'),
  rowIds: z.tuple([z.string()]).rest(z.string()),
});

export const GanttViewSelectionSchema = z.union([
  GanttCellSelectionSchema,
  GanttBarSelectionSchema,
]);

export const GanttViewSelectionWithTypeSchema = z.union([
  z.intersection(GanttViewTypeSchema, GanttCellSelectionSchema),
  z.intersection(GanttViewTypeSchema, GanttBarSelectionSchema),
]);

export type GanttCellSelection = z.TypeOf<typeof GanttCellSelectionSchema>;
export type GanttBarSelection = z.TypeOf<typeof GanttBarSelectionSchema>;
export type GanttViewSelection = z.TypeOf<typeof GanttViewSelectionSchema>;
export type GanttViewSelectionWithType = z.TypeOf<
  typeof GanttViewSelectionWithTypeSchema
>;
