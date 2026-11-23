import { Logger } from '@nestjs/common';
import { z } from 'zod';

import {
  DocCreateIncompleteError,
  DocReader,
  DocWriter,
} from '../../../core/doc';
import { PermissionAccess } from '../../../core/permission';
import { isOrdinaryWorkspaceDoc } from '../../../native';
import { toolError } from './error';
import { defineTool } from './tool';
import type { CopilotChatOptions } from './types';

const logger = new Logger('DocWriteTool');

const stripLeadingH1 = (content: string) =>
  content.replace(/^[ \t]{0,3}#\s+[^\n]*#*\s*\n*/, '');

const sanitizeTitle = (title: string) => title.replace(/[\r\n]+/g, ' ').trim();

export const buildDocCreateHandler = (
  writer: DocWriter,
  ac: PermissionAccess
) => {
  return async (
    options: CopilotChatOptions,
    title: string,
    content: string,
    requestedDocId?: string
  ) => {
    if (!options?.user || !options.workspace) {
      return toolError(
        'Doc Create Failed',
        'Missing user or workspace context'
      );
    }

    const sanitizedTitle = sanitizeTitle(title);
    if (!sanitizedTitle) {
      return toolError('Doc Create Failed', 'Title cannot be empty');
    }

    await ac
      .user(options.user)
      .workspace(options.workspace)
      .assert('Workspace.CreateDoc');

    try {
      let result: { docId: string };
      let isRecovery = false;
      if (requestedDocId !== undefined) {
        isRecovery = true;
        const normalizedDocId = requestedDocId.trim();
        if (
          !normalizedDocId ||
          !isOrdinaryWorkspaceDoc(options.workspace, normalizedDocId)
        ) {
          return toolError(
            'Doc Create Failed',
            `Invalid document ID: ${requestedDocId}`
          );
        }
        await ac
          .user(options.user)
          .workspace(options.workspace)
          .doc(normalizedDocId)
          .assert('Doc.Update');
        result = await writer.recoverDocCreation(
          options.workspace,
          normalizedDocId,
          sanitizedTitle,
          options.user
        );
      } else {
        const strippedContent = stripLeadingH1(content);
        result = await writer.createDoc(
          options.workspace,
          sanitizedTitle,
          strippedContent,
          options.user
        );
      }

      return {
        success: true,
        docId: result.docId,
        message: isRecovery
          ? `Document "${sanitizedTitle}" registration completed`
          : `Document "${sanitizedTitle}" created successfully`,
      };
    } catch (err) {
      if (err instanceof DocCreateIncompleteError) {
        const causeMessage =
          err.cause instanceof Error ? err.cause.message : err.message;
        return toolError(
          'Doc Create Failed',
          `Document ${err.docId} created, but workspace registration failed: ${causeMessage}; retry with doc_id="${err.docId}" to finish registration`,
          {
            code: 'doc_create_incomplete',
            retryable: true,
            locator: { doc_id: err.docId, docId: err.docId },
          }
        );
      }
      throw err;
    }
  };
};

export const buildDocUpdateHandler = (
  writer: DocWriter,
  ac: PermissionAccess,
  reader: DocReader
) => {
  return async (
    options: CopilotChatOptions,
    docId: string,
    content: string
  ) => {
    const notFound = toolError(
      'Doc Update Failed',
      `Doc with id ${docId} not found.`
    );

    if (!options?.user || !options.workspace) {
      return notFound;
    }

    docId = await reader.resolveStorageDocId(options.workspace, docId);
    await ac
      .user(options.user)
      .workspace(options.workspace)
      .doc(docId)
      .assert('Doc.Update');
    try {
      await writer.updateDoc(options.workspace, docId, content, options.user);
    } catch {
      return notFound;
    }

    return {
      success: true,
      docId,
      message: 'Document updated successfully',
    };
  };
};

export const buildDocUpdateMetaHandler = (
  writer: DocWriter,
  ac: PermissionAccess,
  reader: DocReader
) => {
  return async (options: CopilotChatOptions, docId: string, title: string) => {
    const notFound = toolError(
      'Doc Meta Update Failed',
      `Doc with id ${docId} not found.`
    );

    if (!options?.user || !options.workspace) {
      return notFound;
    }

    const sanitizedTitle = sanitizeTitle(title);
    if (!sanitizedTitle) {
      return toolError('Doc Meta Update Failed', 'Title cannot be empty');
    }

    docId = await reader.resolveStorageDocId(options.workspace, docId);
    await ac
      .user(options.user)
      .workspace(options.workspace)
      .doc(docId)
      .assert('Doc.Update');
    try {
      await writer.updateDocMeta(
        options.workspace,
        docId,
        { title: sanitizedTitle },
        options.user
      );
    } catch {
      return notFound;
    }

    return {
      success: true,
      docId,
      message: 'Document title updated successfully',
    };
  };
};

export const createDocCreateTool = (
  createDoc: (title: string, content: string, docId?: string) => Promise<object>
) => {
  return defineTool({
    description:
      'Create a new document in the workspace with the given title and markdown content. Returns the ID of the created document. This tool not support insert or update database block and image yet.',
    inputSchema: z
      .object({
        title: z.string().min(1).describe('The title of the new document'),
        content: z
          .string()
          .describe('The markdown content for the document body'),
        doc_id: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'Optional document ID from an incomplete creation error to finish workspace registration without duplicating content'
          ),
        docId: z
          .string()
          .trim()
          .min(1)
          .optional()
          .describe(
            'Alias of doc_id for retrying incomplete document creation'
          ),
      })
      .strict()
      .refine(v => !v.doc_id || !v.docId || v.doc_id === v.docId, {
        message: 'doc_id and docId must match when both are provided',
      }),
    execute: async ({ title, content, doc_id, docId }) => {
      try {
        return await createDoc(title, content, doc_id ?? docId);
      } catch (err: any) {
        logger.error(`Failed to create document: ${title}`, err);
        return toolError('Doc Create Failed', err.message);
      }
    },
  });
};

export const createDocUpdateTool = (
  updateDoc: (docId: string, content: string) => Promise<object>
) => {
  return defineTool({
    description:
      'Update an existing document with new markdown content (body only). Uses structural diffing to apply minimal changes. This does NOT update the document title. This tool not support insert or update database block and image yet.',
    inputSchema: z.object({
      doc_id: z.string().describe('The ID of the document to update'),
      content: z
        .string()
        .describe(
          'The complete new markdown content for the document body (do NOT include a title H1)'
        ),
    }),
    execute: async ({ doc_id, content }) => {
      try {
        return await updateDoc(doc_id, content);
      } catch (err: any) {
        logger.error(`Failed to update document: ${doc_id}`, err);
        return toolError('Doc Update Failed', err.message);
      }
    },
  });
};

export const createDocUpdateMetaTool = (
  updateDocMeta: (docId: string, title: string) => Promise<object>
) => {
  return defineTool({
    description: 'Update document metadata (currently title only).',
    inputSchema: z.object({
      doc_id: z.string().describe('The ID of the document to update'),
      title: z.string().min(1).describe('The new document title'),
    }),
    execute: async ({ doc_id, title }) => {
      try {
        return await updateDocMeta(doc_id, title);
      } catch (err: any) {
        logger.error(`Failed to update document meta: ${doc_id}`, err);
        return toolError('Doc Meta Update Failed', err.message);
      }
    },
  });
};
