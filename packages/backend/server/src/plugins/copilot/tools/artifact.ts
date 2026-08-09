import { Logger } from '@nestjs/common';
import { z } from 'zod';

import type { ArtifactRetrievalService } from '../retrieval/artifact';
import { toolError } from './error';
import { defineTool } from './tool';
import type { ArtifactSource, CopilotChatOptions } from './types';

const logger = new Logger('ArtifactTool');

export const createArtifactSearchTool = (
  retrieval: ArtifactRetrievalService,
  options: CopilotChatOptions
) =>
  defineTool({
    description:
      'Search workspace artifacts and message attachments within the current retrieval scope. This tool never searches documents or the web.',
    inputSchema: z
      .object({
        query: z.string().trim().min(1).max(2000),
        limit: z.number().int().min(1).max(10).optional(),
      })
      .strict(),
    execute: async ({ query, limit }, execution) => {
      if (!options?.user || !options.workspace || !options.retrievalScope) {
        return toolError('Artifact Search Failed', 'Missing retrieval scope.', {
          code: 'INVALID_CONTEXT',
          retryable: false,
        });
      }
      const result = await retrieval.search({
        userId: options.user,
        workspaceId: options.workspace,
        query,
        retrieval: options.retrievalScope,
        limit: limit ?? 5,
        messageId: options.billingUnitId,
        signal: execution.signal,
      });
      return {
        degraded: result.degraded,
        hits: result.hits.map(hit => ({
          artifact_id: hit.artifactId,
          excerpt: hit.content,
          distance: hit.distance,
          chunk: hit.chunk,
          source: {
            type: 'artifact',
            workspace_id: options.workspace as string,
            artifact_id: hit.artifactId as string,
            name: hit.name,
            mime_type: hit.mimeType,
          } satisfies ArtifactSource,
        })),
      };
    },
  });

export const createArtifactReadTool = (
  retrieval: ArtifactRetrievalService,
  options: CopilotChatOptions
) =>
  defineTool({
    description:
      'Read extracted content from an artifact within the current retrieval scope. Use cursor to continue a truncated result.',
    inputSchema: z
      .object({
        artifact_id: z.string().uuid(),
        max_chars: z.number().int().min(1).max(100_000).optional(),
        cursor: z.string().max(128).optional(),
      })
      .strict(),
    execute: async ({ artifact_id, max_chars, cursor }) => {
      if (!options?.user || !options.workspace || !options.retrievalScope) {
        return toolError('Artifact Read Failed', 'Missing retrieval scope.', {
          code: 'INVALID_CONTEXT',
          retryable: false,
        });
      }
      try {
        const result = await retrieval.read({
          userId: options.user,
          workspaceId: options.workspace,
          artifactId: artifact_id,
          retrieval: options.retrievalScope,
          messageId: options.billingUnitId,
          maxChars: max_chars,
          cursor,
        });
        return {
          artifact_id,
          ...result,
          source: {
            type: 'artifact',
            workspace_id: options.workspace,
            artifact_id,
            name: result.name,
            mime_type: result.mimeType,
            revision: result.revision,
          } satisfies ArtifactSource,
        };
      } catch (error) {
        logger.warn('Artifact read denied or unavailable', error);
        return toolError(
          'Artifact Read Failed',
          'The artifact is unavailable in the current scope.',
          { code: 'ARTIFACT_UNAVAILABLE', retryable: false }
        );
      }
    },
  });
