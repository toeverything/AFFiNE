import { tool } from 'ai';
import { omit } from 'lodash-es';
import { z } from 'zod';

import type { AccessController } from '../../../core/permission';
import {
  type ChunkSimilarity,
  clearEmbeddingChunk,
  type Models,
} from '../../../models';
import type { CopilotContextService } from '../context';
import type { ContextSession } from '../context/session';
import type { CopilotChatOptions } from '../providers';
import { toolError } from './error';

export const buildDocSearchGetter = (
  ac: AccessController,
  context: CopilotContextService,
  docContext: ContextSession | null,
  models: Models
) => {
  const searchDocs = async (
    options: CopilotChatOptions,
    query?: string,
    abortSignal?: AbortSignal
  ) => {
    if (!options || !query?.trim() || !options.user || !options.workspace) {
      return `Invalid search parameters.`;
    }
    const canAccess = await ac
      .user(options.user)
      .workspace(options.workspace)
      .can('Workspace.Read');
    if (!canAccess)
      return 'You do not have permission to access this workspace.';
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
    const blobChunks = chunks.filter(c => 'blobId' in c);
    const fileChunks = chunks.filter(c => 'fileId' in c);
    if (contextChunks.length) {
      fileChunks.push(...contextChunks);
    }
    if (!blobChunks.length && !docChunks.length && !fileChunks.length) {
      return `No results found for "${query}".`;
    }

    const docIds = docChunks.map(c => ({
      // oxlint-disable-next-line no-non-null-assertion
      workspaceId: options.workspace!,
      docId: c.docId,
    }));
    const docAuthors = await models.doc
      .findAuthors(docIds)
      .then(
        docs =>
          new Map(
            docs
              .filter(d => !!d)
              .map(doc => [doc.id, omit(doc, ['id', 'workspaceId'])])
          )
      );
    const docMetas = await models.doc
      .findMetas(docIds, { select: { title: true } })
      .then(
        docs =>
          new Map(
            docs
              .filter(d => !!d)
              .map(doc => [
                doc.docId,
                Object.assign({}, doc, docAuthors.get(doc.docId)),
              ])
          )
      );

    return [
      ...fileChunks.map(clearEmbeddingChunk),
      ...blobChunks.map(clearEmbeddingChunk),
      ...docChunks.map(c => ({
        ...c,
        ...docMetas.get(c.docId),
      })),
    ] as ChunkSimilarity[];
  };
  return searchDocs;
};

export const createDocSemanticSearchTool = (
  searchDocs: (
    query: string,
    abortSignal?: AbortSignal
  ) => Promise<ChunkSimilarity[] | string | undefined>
) => {
  return tool({
    description:
      'Retrieve conceptually related passages by performing vector-based semantic similarity search across embedded documents; use this tool only when exact keyword search fails or the user explicitly needs meaning-level matches (e.g., paraphrases, synonyms, broader concepts, recent documents).',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'The query statement to search for, e.g. "What is the capital of France?"\nWhen querying specific terms or IDs, you should provide the complete string instead of separating it with delimiters.\nFor example, if a user wants to look up the ID "sicDoe1is", use "What is sicDoe1is" instead of "si code 1is".'
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
