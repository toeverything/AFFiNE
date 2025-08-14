import { Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';

import { AccessController } from '../../../core/permission';
import type { ContextSession } from '../context/session';
import type { CopilotChatOptions } from '../providers';
import { toolError } from './error';

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
      return;
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
      return;
    }

    const [file, blob] = await Promise.all([
      context?.getFileContent(blobId, chunk),
      context?.getBlobContent(blobId, chunk),
    ]);
    const content = file?.trim() || blob?.trim();
    if (!content) {
      return;
    }

    return { blobId, chunk, content };
  };
  return getBlobContent;
};

export const createBlobReadTool = (
  getBlobContent: (
    targetId?: string,
    chunk?: number
  ) => Promise<object | undefined>
) => {
  return tool({
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
        if (!blob) {
          return;
        }
        return { ...blob };
      } catch (err: any) {
        logger.error(`Failed to read the blob ${blob_id} in context`, err);
        return toolError('Blob Read Failed', err.message);
      }
    },
  });
};
