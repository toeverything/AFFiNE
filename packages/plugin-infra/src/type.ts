import type { WritableAtom } from 'jotai';
import { z } from 'zod';

export const packageJsonInputSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  affinePlugin: z.object({
    release: z.boolean(),
    entry: z.object({
      core: z.string(),
      server: z.string().optional(),
    }),
    serverCommand: z.array(z.string()).optional(),
  }),
});

export const packageJsonOutputSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  affinePlugin: z.object({
    release: z.boolean(),
    entry: z.object({
      core: z.string(),
    }),
    assets: z.array(z.string()),
    serverCommand: z.array(z.string()).optional(),
  }),
});

export type LayoutDirection = 'horizontal' | 'vertical';
export type LayoutNode = LayoutParentNode | string;
export type LayoutParentNode = {
  direction: LayoutDirection;
  splitPercentage: number; // 0 - 100
  first: LayoutNode;
  second: LayoutNode;
};

export type ExpectedLayout =
  | {
      direction: LayoutDirection;
      // the first element is always the editor
      first: 'editor';
      second: LayoutNode;
      // the percentage should be greater than 70
      splitPercentage: number;
    }
  | 'editor';

type SetStateAction<Value> = Value | ((prev: Value) => Value);

export type ContentLayoutAtom = WritableAtom<
  ExpectedLayout,
  [SetStateAction<ExpectedLayout>],
  void
>;
