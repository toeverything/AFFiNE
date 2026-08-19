import { createHash } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { z } from 'zod';

import type { DocReader } from '../../../core/doc';
import type { PermissionAccess } from '../../../core/permission';
import type {
  CanvasProjectionBlock,
  CanvasProjectionElement,
  CanvasProjectionV1,
  DocBounds,
} from '../../../core/utils/blocksuite';
import type { Models } from '../../../models';
import {
  documentSyncPendingError,
  workspaceSyncRequiredError,
} from './doc-sync';
import { toolError } from './error';
import { defineTool } from './tool';
import {
  type CopilotChatOptions,
  type DocSource,
  type DocumentScope,
  isDocumentInScope,
} from './types';

const logger = new Logger('DocCanvasReadTool');
const MAX_LIMIT = 100;
const MAX_PREVIEW_CHARS = 4_000;
const MAX_RELATION_IDS = 200;

const boundsSchema = z
  .object({
    x: z.number().finite().min(-10_000_000).max(10_000_000),
    y: z.number().finite().min(-10_000_000).max(10_000_000),
    width: z.number().finite().positive().max(10_000_000),
    height: z.number().finite().positive().max(10_000_000),
  })
  .strict();

const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('overview') }).strict(),
  z
    .object({ kind: z.literal('frame'), frame_id: z.string().min(1).max(128) })
    .strict(),
  z
    .object({
      kind: z.literal('elements'),
      element_ids: z.array(z.string().min(1).max(128)).min(1).max(MAX_LIMIT),
    })
    .strict(),
  z.object({ kind: z.literal('region'), bounds: boundsSchema }).strict(),
]);

type CanvasTarget = z.infer<typeof targetSchema>;

const cursorSchema = z
  .object({
    version: z.literal(1),
    projectionVersion: z.number().int().positive(),
    revision: z.string(),
    targetHash: z.string(),
    offset: z.number().int().nonnegative(),
  })
  .strict();
type Cursor = z.infer<typeof cursorSchema>;

function targetHash(target: CanvasTarget) {
  return createHash('sha256').update(JSON.stringify(target)).digest('hex');
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(value: string): Cursor | null {
  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString())
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function boundedContent(value: { text?: string; title?: string }) {
  const text = value.text?.slice(0, MAX_PREVIEW_CHARS);
  const title = value.title?.slice(0, MAX_PREVIEW_CHARS);
  const contentTruncated =
    (value.text?.length ?? 0) > (text?.length ?? 0) ||
    (value.title?.length ?? 0) > (title?.length ?? 0);
  return {
    text,
    title,
    ...(contentTruncated ? { content_truncated: true } : {}),
  };
}

function boundedBlock(value: CanvasProjectionBlock) {
  return {
    id: value.id,
    type: value.type,
    visibility: value.visibility,
    bounds: value.bounds,
    ...boundedContent(value),
    child_ids: value.childIds.slice(0, MAX_RELATION_IDS),
    child_ids_truncated: value.childIds.length > MAX_RELATION_IDS,
  };
}

function boundedElement(value: CanvasProjectionElement) {
  return {
    id: value.id,
    type: value.type,
    bounds: value.bounds,
    ...boundedContent(value),
    frame_id: value.frameId,
    child_ids: value.childIds.slice(0, MAX_RELATION_IDS),
    child_ids_truncated: value.childIds.length > MAX_RELATION_IDS,
    source_id: value.sourceId,
    target_id: value.targetId,
    parent_id: value.parentId,
    index: value.index,
    point_count: value.pointCount,
    color: value.color,
    line_width: value.lineWidth,
  };
}

function intersects(left: DocBounds | undefined, right: DocBounds) {
  return Boolean(
    left &&
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function selectProjection(
  projection: CanvasProjectionV1,
  target: CanvasTarget
) {
  const canvasBlocks = projection.blocks.filter(
    block => block.visibility !== 'page'
  );
  switch (target.kind) {
    case 'overview': {
      const ownedIds = new Set(
        canvasBlocks
          .filter(block => block.type === 'frame')
          .flatMap(block => block.childIds)
      );
      return {
        blocks: canvasBlocks.filter(
          block => block.type === 'frame' || !ownedIds.has(block.id)
        ),
        elements: projection.elements.filter(element => !element.frameId),
      };
    }
    case 'frame': {
      const frame = canvasBlocks.find(block => block.id === target.frame_id);
      const childIds = new Set(frame?.childIds ?? []);
      return {
        blocks: canvasBlocks.filter(
          block => block.id === target.frame_id || childIds.has(block.id)
        ),
        elements: projection.elements.filter(
          element =>
            element.frameId === target.frame_id || childIds.has(element.id)
        ),
      };
    }
    case 'elements': {
      const ids = new Set(target.element_ids);
      return {
        blocks: canvasBlocks.filter(block => ids.has(block.id)),
        elements: projection.elements.filter(element => ids.has(element.id)),
      };
    }
    case 'region':
      return {
        blocks: canvasBlocks.filter(block =>
          intersects(block.bounds, target.bounds)
        ),
        elements: projection.elements.filter(element =>
          intersects(element.bounds, target.bounds)
        ),
      };
  }
}

export const buildDocCanvasGetter = (
  ac: PermissionAccess,
  docReader: DocReader,
  models: Models,
  documentScope?: DocumentScope
) => {
  return async (
    options: CopilotChatOptions,
    docId: string,
    target: CanvasTarget,
    cursorValue: string | undefined,
    requestedLimit: number | undefined
  ) => {
    if (!options?.user || !options.workspace) {
      return toolError('Doc Canvas Read Failed', 'Missing workspace or user.', {
        code: 'INVALID_CONTEXT',
        retryable: false,
      });
    }
    if (!isDocumentInScope(documentScope, docId)) {
      return toolError(
        'Doc Canvas Read Failed',
        'The document is outside the user-selected document scope.',
        {
          code: 'DOC_SCOPE_DENIED',
          retryable: false,
          locator: { doc_id: docId },
        }
      );
    }
    if (!(await models.workspace.get(options.workspace))) {
      return workspaceSyncRequiredError();
    }
    const canAccess = await ac
      .user(options.user)
      .workspace(options.workspace)
      .doc(docId)
      .can('Doc.Read');
    if (!canAccess) {
      return toolError('Doc Canvas Read Failed', 'Document access denied.', {
        code: 'DOC_ACCESS_DENIED',
        retryable: false,
        locator: { doc_id: docId },
      });
    }
    const projection = await docReader.getDocCanvas(options.workspace, docId);
    if (!projection) {
      return documentSyncPendingError(docId);
    }
    const cursor = cursorValue ? decodeCursor(cursorValue) : null;
    if (cursorValue && !cursor) {
      return toolError('Doc Canvas Read Failed', 'Invalid canvas cursor.', {
        code: 'INVALID_CURSOR',
        retryable: false,
        locator: { doc_id: docId },
      });
    }
    const fingerprint = targetHash(target);
    if (
      cursor &&
      (cursor.projectionVersion !== projection.version ||
        cursor.revision !== projection.revision ||
        cursor.targetHash !== fingerprint)
    ) {
      return toolError(
        'Doc Canvas Read Failed',
        'The document changed after this cursor was issued.',
        {
          code: 'REVISION_CHANGED',
          retryable: true,
          locator: { doc_id: docId, revision: projection.revision },
        }
      );
    }
    const selected = selectProjection(projection, target);
    const items = [
      ...selected.blocks.map(value => ({ kind: 'block' as const, value })),
      ...selected.elements.map(value => ({ kind: 'element' as const, value })),
    ].sort((left, right) => left.value.id.localeCompare(right.value.id));
    const offset = cursor?.offset ?? 0;
    const limit = Math.min(requestedLimit ?? 50, MAX_LIMIT);
    const page = items.slice(offset, offset + limit);
    const nextOffset = offset + page.length;
    const truncated = nextOffset < items.length;
    return {
      doc_id: projection.docId,
      revision: projection.revision,
      target,
      bounds: projection.bounds,
      counts: projection.counts,
      blocks: page
        .filter(item => item.kind === 'block')
        .map(item => boundedBlock(item.value)),
      elements: page
        .filter(item => item.kind === 'element')
        .map(item => boundedElement(item.value)),
      truncated,
      next_cursor: truncated
        ? encodeCursor({
            version: 1,
            projectionVersion: projection.version,
            revision: projection.revision,
            targetHash: fingerprint,
            offset: nextOffset,
          })
        : undefined,
      warnings: projection.warnings.slice(0, MAX_LIMIT),
      warnings_truncated: projection.warnings.length > MAX_LIMIT,
      source: {
        type: 'document' as const,
        workspace_id: options.workspace,
        doc_id: projection.docId,
        title: projection.title,
        revision: projection.revision,
        visibility: 'edgeless' as const,
      } satisfies DocSource,
    };
  };
};

type CanvasReadResult = Awaited<
  ReturnType<ReturnType<typeof buildDocCanvasGetter>>
>;

export const createDocCanvasReadTool = (
  readCanvas: (
    docId: string,
    target: CanvasTarget,
    cursor?: string,
    limit?: number
  ) => Promise<CanvasReadResult>
) =>
  defineTool({
    description:
      'Read bounded structure from a persisted document canvas. Use overview first, then a frame, element ids, or region for detail. Use doc_read for Page text and frontend tools for unsynced editor state. Cursors are revision-bound.',
    inputSchema: z
      .object({
        doc_id: z.string().min(1).max(128),
        target: targetSchema,
        cursor: z.string().max(2048).optional(),
        limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
      })
      .strict(),
    execute: async ({ doc_id, target, cursor, limit }) => {
      try {
        return await readCanvas(doc_id, target, cursor, limit);
      } catch {
        logger.error(`Failed to read canvas ${doc_id}: DOC_CANVAS_READ_FAILED`);
        return toolError(
          'Doc Canvas Read Failed',
          'The persisted canvas could not be read.',
          {
            code: 'DOC_CANVAS_READ_FAILED',
            retryable: false,
            locator: { doc_id },
          }
        );
      }
    },
  });
