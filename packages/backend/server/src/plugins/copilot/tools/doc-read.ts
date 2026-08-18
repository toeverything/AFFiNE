import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { DocReader } from '../../../core/doc';
import { PermissionAccess } from '../../../core/permission';
import { Models } from '../../../models';
import {
  documentSyncPendingError,
  workspaceSyncRequiredError,
} from './doc-sync';
import { type ToolError, toolError } from './error';
import { defineTool } from './tool';
import {
  type CopilotChatOptions,
  type DocSource,
  type DocumentScope,
  isDocumentInScope,
} from './types';

const logger = new Logger('DocReadTool');

const isToolError = (result: ToolError | object): result is ToolError =>
  'type' in result && result.type === 'error';

export const buildDocContentGetter = (
  ac: PermissionAccess,
  docReader: DocReader,
  models: Models,
  documentScope?: DocumentScope
) => {
  const getDoc = async (
    options: CopilotChatOptions,
    docId?: string,
    maxChars = 40_000
  ) => {
    if (!options?.user || !options?.workspace || !docId) {
      return toolError(
        'Doc Read Failed',
        'Missing workspace, user, or document id for doc_read.',
        { code: 'INVALID_CONTEXT', retryable: false }
      );
    }
    if (!isDocumentInScope(documentScope, docId)) {
      return toolError(
        'Doc Read Failed',
        'The document is outside the user-selected document scope.',
        {
          code: 'DOC_SCOPE_DENIED',
          retryable: false,
          locator: { doc_id: docId },
        }
      );
    }

    const workspace = await models.workspace.get(options.workspace);
    if (!workspace) {
      return workspaceSyncRequiredError();
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
      return toolError('Doc Read Failed', 'Document access denied.', {
        code: 'DOC_ACCESS_DENIED',
        retryable: false,
        locator: { doc_id: docId },
      });
    }

    const docMeta = await models.doc.getAuthors(options.workspace, docId);
    if (!docMeta) {
      return documentSyncPendingError(docId);
    }

    const content = await docReader.getDocMarkdown(
      options.workspace,
      docId,
      true
    );
    if (!content) {
      return documentSyncPendingError(docId);
    }

    const markdown = content.markdown.slice(0, maxChars);
    return {
      doc_id: docId,
      title: content.title,
      markdown,
      revision: content.revision,
      max_chars: maxChars,
      truncated: markdown.length < content.markdown.length,
      source: {
        type: 'document' as const,
        workspace_id: options.workspace,
        doc_id: docId,
        title: content.title,
        revision: content.revision,
        visibility: 'page' as const,
      } satisfies DocSource,
    };
  };
  return getDoc;
};

type DocReadToolResult = Awaited<
  ReturnType<ReturnType<typeof buildDocContentGetter>>
>;

export const createDocReadTool = (
  getDoc: (targetId?: string, maxChars?: number) => Promise<DocReadToolResult>
) => {
  return defineTool({
    description:
      'Read Page-mode text from a persisted document. Use doc_canvas_read for canvas-only content and frontend read tools for unsynced editor state. The result includes its persisted revision and may be truncated.',
    inputSchema: z
      .object({
        doc_id: z
          .string()
          .min(1)
          .max(128)
          .describe('The persisted document to read'),
        max_chars: z.number().int().min(1).max(100_000).optional(),
      })
      .strict(),
    execute: async ({ doc_id, max_chars }) => {
      try {
        const doc = await getDoc(
          doc_id,
          Math.min(max_chars ?? 40_000, 100_000)
        );
        return isToolError(doc) ? doc : { ...doc };
      } catch {
        logger.error(`Failed to read doc ${doc_id}: DOC_READ_FAILED`);
        return toolError(
          'Doc Read Failed',
          'The persisted Page content could not be read.',
          { code: 'DOC_READ_FAILED', retryable: false, locator: { doc_id } }
        );
      }
    },
  });
};
