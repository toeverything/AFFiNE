import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { AccessController } from '../../../core/permission';
import { toolError } from './error';
import { defineTool } from './tool';
import type { ContextSession, CopilotChatOptions } from './types';

const logger = new Logger('ContextBlobReadTool');

export const buildBlobContentGetter = (
  ac: AccessController,
  context: ContextSession | null
) => {
  const getBlobContent = async (
    options: CopilotChatOptions,
    blobId?: string,
    chunk?: number
  ) => {
    if (!options?.user || !options?.workspace || !blobId || !context) {
      return toolError(
        'Blob Read Failed',
        'Missing workspace, user, blob id, or copilot context for blob_read.'
      );
    }
    const canAccess = await ac
      .user(options.user)
      .workspace(options.workspace)
      .allowLocal()
      .can('Workspace.Read');
    if (!canAccess || context.workspaceId !== options.workspace) {
      logger.warn(
        `User ${options.user} does not have access workspace ${options.workspace}`
      );
      return toolError(
        'Blob Read Failed',
        'You do not have permission to access this workspace attachment.'
      );
    }

    const contextFile = context.files.find(
      file => file.blobId === blobId || file.id === blobId
    );
    const canonicalBlobId = contextFile?.blobId ?? blobId;
    const targetFileId = contextFile?.id;
    const [file, blob] = await Promise.all([
      targetFileId ? context.getFileContent(targetFileId, chunk) : undefined,
      context.getBlobContent(canonicalBlobId, chunk),
    ]);
    const content = file?.trim() || blob?.trim();
    if (!content) {
      return toolError(
        'Blob Read Failed',
        `Attachment ${canonicalBlobId} is not available for reading in the current copilot context.`
      );
    }
    const info = contextFile
      ? { fileName: contextFile.name, fileType: contextFile.mimeType }
      : {};

    return { blobId: canonicalBlobId, chunk, content, ...info };
  };
  return getBlobContent;
};

export const createBlobReadTool = (
  getBlobContent: (targetId?: string, chunk?: number) => Promise<object>
) => {
  return defineTool({
    description:
      'Return the content and basic metadata of a single attachment identified by blobId; more inclined to use search tools rather than this tool.',
    inputSchema: z.object({
      blob_id: z.string().describe('The target blob in context to read'),
      chunk: z
        .number()
        .optional()
        .describe(
          'The chunk number to read, if not provided, read the whole content, start from 0'
        ),
    }),
    execute: async ({ blob_id, chunk }) => {
      try {
        const blob = await getBlobContent(blob_id, chunk);
        return { ...blob };
      } catch (err: any) {
        logger.error(`Failed to read the blob ${blob_id} in context`, err);
        return toolError('Blob Read Failed', err.message ?? String(err));
      }
    },
  });
};
