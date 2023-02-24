import { z } from 'zod';

export const publicRuntimeConfigSchema = z.object({
  serverAPI: z.string(),
});

export type PublicRuntimeConfig = z.infer<typeof publicRuntimeConfigSchema>;
