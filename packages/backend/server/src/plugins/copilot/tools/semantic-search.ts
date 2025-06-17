import { tool } from 'ai';
import { z } from 'zod';

import type { AccessController } from '../../../core/permission';
import type { ChunkSimilarity } from '../../../models';
import type { CopilotContextService } from '../context';
import type { CopilotChatOptions } from '../providers';

export const buildDocSearchGetter = (
  ac: AccessController,
  context: CopilotContextService
) => {
  const searchDocs = async (options: CopilotChatOptions, query?: string) => {
    if (!options || !query?.trim() || !options.user || !options.workspace) {
      return undefined;
    }
    const canAccess = await ac
      .user(options.user)
      .workspace(options.workspace)
      .can('Workspace.Read');
    if (!canAccess) return undefined;
    const chunks = await context.matchWorkspaceAll(options.workspace, query);
    return chunks || undefined;
  };
  return searchDocs;
};

export const createSemanticSearchTool = (
  searchDocs: (query: string) => Promise<ChunkSimilarity[] | undefined>
) => {
  return tool({
    description:
      'Semantic search for relevant documents in the current workspace',
    parameters: z.object({
      query: z.string().describe('The query to search for.'),
    }),
    execute: async ({ query }) => {
      try {
        return await searchDocs(query);
      } catch {
        return 'Failed to search documents.';
      }
    },
  });
};
