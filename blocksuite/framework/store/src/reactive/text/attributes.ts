import { z } from 'zod';

export const baseTextAttributes = z.object({
  bold: z.literal(true).optional().nullable().catch(undefined),
  italic: z.literal(true).optional().nullable().catch(undefined),
  underline: z.literal(true).optional().nullable().catch(undefined),
  strike: z.literal(true).optional().nullable().catch(undefined),
  code: z.literal(true).optional().nullable().catch(undefined),
  link: z.string().optional().nullable().catch(undefined),
});

export type BaseTextAttributes = z.infer<typeof baseTextAttributes>;
