import type { DocsPropertiesMeta } from '@blocksuite/affine/store';
import { z } from 'zod';

export const literalValueSchema: z.ZodType<LiteralValue, z.ZodTypeDef> =
  z.union([
    z.number(),
    z.string(),
    z.boolean(),
    z.array(z.lazy(() => literalValueSchema)),
    z.record(z.lazy(() => literalValueSchema)),
  ]);

export type LiteralValue =
  | number
  | string
  | boolean
  | {
      [K: string]: LiteralValue;
    }
  | Array<LiteralValue>;

export const refSchema: z.ZodType<Ref, z.ZodTypeDef> = z.object({
  type: z.literal('ref'),
  name: z.never(),
});

export type Ref = {
  type: 'ref';
  name: keyof VariableMap;
};

export interface VariableMap {}

export const literalSchema = z.object({
  type: z.literal('literal'),
  value: literalValueSchema,
});

export type Literal = z.input<typeof literalSchema>;

export const filterSchema = z.object({
  type: z.literal('filter'),
  left: refSchema,
  funcName: z.string(),
  args: z.array(literalSchema),
});

export type Filter = z.input<typeof filterSchema>;

export const collectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  filterList: z.array(filterSchema),
  allowList: z.array(z.string()),
  createDate: z.union([z.date(), z.number()]).optional(),
  updateDate: z.union([z.date(), z.number()]).optional(),
});
export type Collection = z.input<typeof collectionSchema>;

export type PropertiesMeta = DocsPropertiesMeta;
