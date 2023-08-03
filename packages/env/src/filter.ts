import type { Workspace } from '@blocksuite/store';
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
  | { [K: string]: LiteralValue }
  | Array<LiteralValue>;

export const refSchema: z.ZodType<Ref, z.ZodTypeDef> = z.object({
  type: z.literal('ref'),
  name: z.never(),
});

export type Ref = {
  type: 'ref';
  name: keyof VariableMap;
};

// eslint-disable-next-line @typescript-eslint/no-empty-interface
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
  workspaceId: z.string(),
  name: z.string(),
  pinned: z.boolean().optional(),
  filterList: z.array(filterSchema),
  allowList: z.array(z.string()).optional(),
  excludeList: z.array(z.string()).optional(),
});

export type Collection = z.input<typeof collectionSchema>;

export const tagSchema = z.object({
  id: z.string(),
  value: z.string(),
  color: z.string(),
  parentId: z.string().optional(),
});
export type Tag = z.input<typeof tagSchema>;

export type PropertiesMeta = Workspace['meta']['properties'];
