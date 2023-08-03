import type { ExpectedLayout } from '@affine/sdk/entry';
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

type SetStateAction<Value> = Value | ((prev: Value) => Value);

export type ContentLayoutAtom = WritableAtom<
  ExpectedLayout,
  [SetStateAction<ExpectedLayout>],
  void
>;
