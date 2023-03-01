import { z } from 'zod';

export const publicRuntimeConfigSchema = z.object({
  serverAPI: z.string(),
  enableIndexedDBProvider: z.boolean(),
  prefetchWorkspace: z.boolean(),
});

export type PublicRuntimeConfig = z.infer<typeof publicRuntimeConfigSchema>;
