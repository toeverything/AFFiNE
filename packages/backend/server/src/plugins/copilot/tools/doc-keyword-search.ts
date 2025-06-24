import { tool } from 'ai';
import { z } from 'zod';

import type { AccessController } from '../../../core/permission';
import type { IndexerService, SearchDoc } from '../../indexer';
import type { CopilotChatOptions } from '../providers';

export const buildDocKeywordSearchGetter = (
  ac: AccessController,
  indexerService: IndexerService
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
    const docs = await indexerService.searchDocsByKeyword(
      options.workspace,
      query
    );

    // filter current user readable docs
    const readableDocs = await ac
      .user(options.user)
      .workspace(options.workspace)
      .docs(docs, 'Doc.Read');
    return readableDocs;
  };
  return searchDocs;
};

export const createDocKeywordSearchTool = (
  searchDocs: (query: string) => Promise<SearchDoc[] | undefined>
) => {
  return tool({
    description:
      'Full-text search for relevant documents in the current workspace',
    parameters: z.object({
      query: z.string().describe('The query to search for'),
    }),
    execute: async ({ query }) => {
      try {
        const docs = await searchDocs(query);
        if (!docs) {
          return;
        }
        return docs.map(doc => ({
          docId: doc.docId,
          title: doc.title,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt,
          createdByUser: doc.createdByUser,
          updatedByUser: doc.updatedByUser,
        }));
      } catch {
        return 'Failed to search documents.';
      }
    },
  });
};
