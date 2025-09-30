import { Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';

import { DocReader } from '../../../core/doc';
import { AccessController } from '../../../core/permission';
import { Models, publicUserSelect } from '../../../models';
import type { CopilotChatOptions } from '../providers';
import { toolError } from './error';

const logger = new Logger('DocReadTool');

export const buildDocContentGetter = (
  ac: AccessController,
  docReader: DocReader,
  models: Models
) => {
  const getDoc = async (options: CopilotChatOptions, docId?: string) => {
    if (!options?.user || !options?.workspace || !docId) {
      return;
    }
    const canAccess = await ac
      .user(options.user)
      .workspace(options.workspace)
      .doc(docId)
      .can('Doc.Read');
    if (!canAccess) {
      logger.warn(
        `User ${options.user} does not have access to doc ${docId} in workspace ${options.workspace}`
      );
      return;
    }

    const docMeta = await models.doc.getSnapshot(options.workspace, docId, {
      select: {
        createdAt: true,
        updatedAt: true,
        createdByUser: {
          select: publicUserSelect,
        },
        updatedByUser: {
          select: publicUserSelect,
        },
      },
    });
    if (!docMeta) {
      return;
    }

    const content = await docReader.getDocMarkdown(
      options.workspace,
      docId,
      true
    );
    if (!content) {
      return;
    }

    return {
      docId,
      title: content.title,
      markdown: content.markdown,
      createdAt: docMeta.createdAt,
      updatedAt: docMeta.updatedAt,
      createdByUser: docMeta.createdByUser,
      updatedByUser: docMeta.updatedByUser,
    };
  };
  return getDoc;
};

export const createDocReadTool = (
  getDoc: (targetId?: string) => Promise<object | undefined>
) => {
  return tool({
    description:
      'Return the complete text and basic metadata of a single document identified by docId; use this when the user needs the full content of a specific file rather than a search result.',
    inputSchema: z.object({
      doc_id: z.string().describe('The target doc to read'),
    }),
    execute: async ({ doc_id }) => {
      try {
        const doc = await getDoc(doc_id);
        if (!doc) {
          return;
        }
        return { ...doc };
      } catch (err: any) {
        logger.error(`Failed to read the doc ${doc_id}`, err);
        return toolError('Doc Read Failed', err.message);
      }
    },
  });
};
