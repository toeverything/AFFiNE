import { z } from 'zod';

export const publicRuntimeConfigSchema = z.object({
  PROJECT_NAME: z.string(),
  BUILD_DATE: z.string(),
  gitVersion: z.string(),
  hash: z.string(),
  serverAPI: z.string(),
  editorVersion: z.string(),
  enableIndexedDBProvider: z.boolean(),
  prefetchWorkspace: z.boolean(),
});

export type PublicRuntimeConfig = z.infer<typeof publicRuntimeConfigSchema>;
