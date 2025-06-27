import { tool } from 'ai';
import { z } from 'zod';

import type { AccessController } from '../../../core/permission';
import type { ChunkSimilarity } from '../../../models';
import type { CopilotContextService } from '../context';
import type { ContextSession } from '../context/session';
import type { CopilotChatOptions } from '../providers';
import { toolError } from './error';

export const buildDocSearchGetter = (
  ac: AccessController,
  context: CopilotContextService,
  docContext: ContextSession | null
) => {
  const searchDocs = async (
    options: CopilotChatOptions,
    query?: string,
    abortSignal?: AbortSignal
  ) => {
    if (!options || !query?.trim() || !options.user || !options.workspace) {
      return undefined;
    }
    const canAccess = await ac
      .user(options.user)
      .workspace(options.workspace)
      .can('Workspace.Read');
    if (!canAccess) return undefined;
    const [chunks, contextChunks] = await Promise.all([
      context.matchWorkspaceAll(options.workspace, query, 10, abortSignal),
      docContext?.matchFiles(query, 10, abortSignal) ?? [],
    ]);

    const docChunks = await ac
      .user(options.user)
      .workspace(options.workspace)
      .docs(
        chunks.filter(c => 'docId' in c),
        'Doc.Read'
      );
    const fileChunks = chunks.filter(c => 'fileId' in c);
    if (contextChunks.length) {
      fileChunks.push(...contextChunks);
    }
    if (!docChunks.length && !fileChunks.length) return undefined;
    return [...fileChunks, ...docChunks];
  };
  return searchDocs;
};

export const createDocSemanticSearchTool = (
  searchDocs: (
    query: string,
    abortSignal?: AbortSignal
  ) => Promise<ChunkSimilarity[] | undefined>
) => {
  return tool({
    description:
      'Semantic search for relevant documents in the current workspace',
    parameters: z.object({
      query: z
        .string()
        .describe(
          'The query statement to search for, e.g. "What is the capital of France?"'
        ),
    }),
    execute: async ({ query }, options) => {
      try {
        return await searchDocs(query, options.abortSignal);
      } catch (e: any) {
        return toolError('Doc Semantic Search Failed', e.message);
      }
    },
  });
};
