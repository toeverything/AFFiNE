import { Logger } from '@nestjs/common';
import { z } from 'zod';

import type { DocumentRetrievalService } from '../retrieval/document';
import { toolError } from './error';
import { defineTool } from './tool';
import type { CopilotChatOptions, DocSource, DocumentScope } from './types';

const logger = new Logger('DocSearchTool');

export const buildDocumentSearch = (
  retrieval: DocumentRetrievalService,
  options: CopilotChatOptions,
  documentScope?: DocumentScope
) => {
  return async (
    query: string,
    docIds: string[] | undefined,
    limit: number,
    signal?: AbortSignal
  ) => {
    if (!options?.workspace || !options.user) {
      return toolError('Document Search Failed', 'Missing workspace or user.', {
        code: 'INVALID_CONTEXT',
        retryable: false,
      });
    }
    const workspaceId = options.workspace;
    const allowed = documentScope
      ? new Set(documentScope.allowedDocIds)
      : undefined;
    const effectiveDocIds = allowed
      ? [...allowed]
      : docIds?.length
        ? docIds
        : undefined;
    if (allowed?.size === 0) {
      return {
        scope_mode: 'selected' as const,
        scope_doc_count: 0,
        retrieval_mode: 'scoped',
        degraded_reason: undefined,
        hits: [],
      };
    }
    try {
      const result = await retrieval.search(
        options,
        query,
        effectiveDocIds,
        limit,
        signal
      );
      return {
        scope_mode: documentScope
          ? ('selected' as const)
          : ('workspace' as const),
        scope_doc_count: documentScope?.allowedDocIds.length,
        retrieval_mode: result.retrievalMode,
        degraded_reason: result.degradedReason,
        hits: result.hits.map(hit => ({
          doc_id: hit.docId,
          title: hit.title,
          excerpt: hit.excerpt,
          visibility: hit.visibility,
          block_id: hit.blockId,
          element_id: hit.elementId,
          frame_id: hit.frameId,
          updated_at: hit.updatedAt,
          score: hit.score,
          source: {
            type: 'document' as const,
            workspace_id: workspaceId,
            doc_id: hit.docId,
            title: hit.title,
            visibility: hit.visibility,
            block_id: hit.blockId,
            element_id: hit.elementId,
            frame_id: hit.frameId,
          } satisfies DocSource,
        })),
      };
    } catch (error) {
      const unavailable =
        error instanceof Error && error.message === 'SEARCH_UNAVAILABLE';
      const code = unavailable
        ? 'SEARCH_UNAVAILABLE'
        : 'DOCUMENT_SEARCH_FAILED';
      logger.error(`Document search failed: ${code}`);
      return toolError(
        'Document Search Failed',
        'Document search is unavailable.',
        {
          code,
          retryable: unavailable,
        }
      );
    }
  };
};

type DocumentSearchResult = Awaited<
  ReturnType<ReturnType<typeof buildDocumentSearch>>
>;

export const createDocSearchTool = (
  search: (
    query: string,
    docIds: string[] | undefined,
    limit: number,
    signal?: AbortSignal
  ) => Promise<DocumentSearchResult>
) =>
  defineTool({
    description:
      'Search persisted workspace documents and return bounded passages with Page or canvas locators. The runtime chooses hybrid, lexical, or vector retrieval. This tool never searches files, blobs, session attachments, or the web.',
    inputSchema: z
      .object({
        query: z.string().trim().min(1).max(2000),
        doc_ids: z
          .array(z.string().min(1).max(128))
          .max(50)
          .optional()
          .describe(
            'Restrict workspace search to these document ids. When the user selected documents above the chat input, the complete selected scope is always searched instead.'
          ),
        limit: z.number().int().min(1).max(20).optional(),
      })
      .strict(),
    execute: ({ query, doc_ids, limit }, options) =>
      search(query, doc_ids, Math.min(limit ?? 10, 20), options.signal),
  });
