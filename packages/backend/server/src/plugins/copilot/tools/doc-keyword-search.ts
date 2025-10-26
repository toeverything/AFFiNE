import { tool } from 'ai';
import { z } from 'zod';

import type { AccessController } from '../../../core/permission';
import type { IndexerService, SearchDoc } from '../../indexer';
import type { CopilotChatOptions } from '../providers';
import { toolError } from './error';

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
      'Fuzzy search all workspace documents for the exact keyword or phrase supplied and return passages ranked by textual match. Use this tool by default whenever a straightforward term-based or keyword-base lookup is sufficient.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'The query to search for, e.g. "meeting notes" or "project plan".'
        ),
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
      } catch (e: any) {
        return toolError('Doc Keyword Search Failed', e.message);
      }
    },
  });
};
