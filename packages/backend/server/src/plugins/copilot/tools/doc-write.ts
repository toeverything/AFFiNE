import { Logger } from '@nestjs/common';
import { tool } from 'ai';
import { z } from 'zod';

import { DocWriter } from '../../../core/doc';
import { AccessController } from '../../../core/permission';
import type { CopilotChatOptions } from '../providers';
import { toolError } from './error';

const logger = new Logger('DocWriteTool');

const stripLeadingH1 = (content: string) =>
  content.replace(/^[ \t]{0,3}#\s+[^\n]*#*\s*\n*/, '');

const sanitizeTitle = (title: string) => title.replace(/[\r\n]+/g, ' ').trim();

export const buildDocCreateHandler = (
  ac: AccessController,
  writer: DocWriter
) => {
  return async (
    options: CopilotChatOptions,
    title: string,
    content: string
  ) => {
    if (!options?.user || !options.workspace) {
      return toolError(
        'Doc Create Failed',
        'Missing user or workspace context'
      );
    }

    await ac
      .user(options.user)
      .workspace(options.workspace)
      .assert('Workspace.CreateDoc');

    const sanitizedTitle = sanitizeTitle(title);
    if (!sanitizedTitle) {
      return toolError('Doc Create Failed', 'Title cannot be empty');
    }

    const strippedContent = stripLeadingH1(content);
    const result = await writer.createDoc(
      options.workspace,
      sanitizedTitle,
      strippedContent,
      options.user
    );

    return {
      success: true,
      docId: result.docId,
      message: `Document "${sanitizedTitle}" created successfully`,
    };
  };
};

export const buildDocUpdateHandler = (
  ac: AccessController,
  writer: DocWriter
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

    const canAccess = await ac
      .user(options.user)
      .workspace(options.workspace)
      .doc(docId)
      .can('Doc.Update');

    if (!canAccess) {
      return notFound;
    }

    await writer.updateDoc(options.workspace, docId, content, options.user);

    return {
      success: true,
      docId,
      message: 'Document updated successfully',
    };
  };
};

export const buildDocUpdateMetaHandler = (
  ac: AccessController,
  writer: DocWriter
) => {
  return async (options: CopilotChatOptions, docId: string, title: string) => {
    const notFound = toolError(
      'Doc Meta Update Failed',
      `Doc with id ${docId} not found.`
    );

    if (!options?.user || !options.workspace) {
      return notFound;
    }

    const canAccess = await ac
      .user(options.user)
      .workspace(options.workspace)
      .doc(docId)
      .can('Doc.Update');

    if (!canAccess) {
      return notFound;
    }

    const sanitizedTitle = sanitizeTitle(title);
    if (!sanitizedTitle) {
      return toolError('Doc Meta Update Failed', 'Title cannot be empty');
    }

    await writer.updateDocMeta(
      options.workspace,
      docId,
      { title: sanitizedTitle },
      options.user
    );

    return {
      success: true,
      docId,
      message: 'Document title updated successfully',
    };
  };
};

export const createDocCreateTool = (
  createDoc: (title: string, content: string) => Promise<object>
) => {
  return tool({
    description:
      'Create a new document in the workspace with the given title and markdown content. Returns the ID of the created document. This tool not support insert or update database block and image yet.',
    inputSchema: z.object({
      title: z.string().min(1).describe('The title of the new document'),
      content: z
        .string()
        .describe('The markdown content for the document body'),
    }),
    execute: async ({ title, content }) => {
      try {
        return await createDoc(title, content);
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
  return tool({
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
  return tool({
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
