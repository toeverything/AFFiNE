import { z } from 'zod';

import {
  parsePageDocFromBinary,
  parseWorkspaceDocFromBinary,
  parseYDocToMarkdown,
  projectDocCanvasFromBinary,
  projectDocSearchFromBinary,
  readAllDocIdsFromRootDoc,
} from '../../native';

const DocVisibilitySchema = z.enum(['page', 'edgeless', 'both']);
const DocBoundsSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
  })
  .strict();
const ProjectionWarningSchema = z
  .object({ code: z.string(), locator: z.string() })
  .strict();
const CanvasProjectionBlockSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    visibility: DocVisibilitySchema,
    bounds: DocBoundsSchema.optional(),
    text: z.string().optional(),
    title: z.string().optional(),
    childIds: z.array(z.string()),
  })
  .strict();
const CanvasProjectionElementSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    bounds: DocBoundsSchema.optional(),
    text: z.string().optional(),
    title: z.string().optional(),
    frameId: z.string().optional(),
    childIds: z.array(z.string()),
    sourceId: z.string().optional(),
    targetId: z.string().optional(),
    parentId: z.string().optional(),
    index: z.string().optional(),
    pointCount: z.number().int().nonnegative().optional(),
    color: z.string().optional(),
    lineWidth: z.number().finite().optional(),
  })
  .strict();
const CanvasProjectionV1Schema = z
  .object({
    version: z.literal(1),
    docId: z.string(),
    revision: z.string(),
    title: z.string(),
    surfaceBlockId: z.string().optional(),
    bounds: DocBoundsSchema.optional(),
    counts: z.record(z.string(), z.number().int().nonnegative()),
    blocks: z.array(CanvasProjectionBlockSchema),
    elements: z.array(CanvasProjectionElementSchema),
    warnings: z.array(ProjectionWarningSchema),
  })
  .strict();
const DocumentSearchUnitV1Schema = z
  .object({
    unitId: z.string(),
    source: z.enum(['page-block', 'canvas-block', 'surface-element']),
    visibility: DocVisibilitySchema,
    blockId: z.string().optional(),
    elementId: z.string().optional(),
    frameId: z.string().optional(),
    blobId: z.string().optional(),
    refDocIds: z.array(z.string()),
    refs: z.array(z.string()),
    parentFlavour: z.string().optional(),
    parentBlockId: z.string().optional(),
    additional: z.string().optional(),
    type: z.string(),
    text: z.string(),
  })
  .strict();
const DocumentSearchProjectionV1Schema = z
  .object({
    version: z.literal(1),
    docId: z.string(),
    revision: z.string(),
    sourceHash: z.string(),
    title: z.string(),
    units: z.array(DocumentSearchUnitV1Schema),
    warnings: z.array(ProjectionWarningSchema),
  })
  .strict();

export type DocVisibility = z.infer<typeof DocVisibilitySchema>;
export type DocBounds = z.infer<typeof DocBoundsSchema>;
export type ProjectionWarning = z.infer<typeof ProjectionWarningSchema>;
export type CanvasProjectionBlock = z.infer<typeof CanvasProjectionBlockSchema>;
export type CanvasProjectionElement = z.infer<
  typeof CanvasProjectionElementSchema
>;
export type CanvasProjectionV1 = z.infer<typeof CanvasProjectionV1Schema>;
export type DocumentSearchUnitV1 = z.infer<typeof DocumentSearchUnitV1Schema>;
export type DocumentSearchProjectionV1 = z.infer<
  typeof DocumentSearchProjectionV1Schema
>;

export const parseCanvasProjection = (value: unknown) =>
  CanvasProjectionV1Schema.parse(value);

export interface PageDocContent {
  title: string;
  summary: string;
}

export interface WorkspaceDocContent {
  name: string;
  avatarKey: string;
}

export interface DocMarkdownContent {
  title: string;
  markdown: string;
  knownUnsupportedBlocks: string[];
  unknownBlocks: string[];
}

export interface ParsePageOptions {
  maxSummaryLength?: number;
}

export function parseWorkspaceDoc(
  snapshot: Uint8Array
): WorkspaceDocContent | null {
  return parseWorkspaceDocFromBinary(Buffer.from(snapshot)) ?? null;
}

export function parsePageDoc(
  docSnapshot: Uint8Array,
  opts: ParsePageOptions = { maxSummaryLength: 150 }
): PageDocContent | null {
  return (
    parsePageDocFromBinary(
      Buffer.from(docSnapshot),
      opts?.maxSummaryLength ?? 150
    ) ?? null
  );
}

export function readAllDocIdsFromWorkspaceSnapshot(
  snapshot: Uint8Array,
  includeTrash = false
) {
  return readAllDocIdsFromRootDoc(Buffer.from(snapshot), includeTrash);
}

export function projectDocCanvas(
  docSnapshot: Uint8Array,
  docId: string,
  revision: string
): CanvasProjectionV1 {
  return parseCanvasProjection(
    projectDocCanvasFromBinary(Buffer.from(docSnapshot), docId, revision)
  );
}

export function projectDocSearch(
  docSnapshot: Uint8Array,
  docId: string,
  revision: string
): DocumentSearchProjectionV1 {
  return DocumentSearchProjectionV1Schema.parse(
    projectDocSearchFromBinary(Buffer.from(docSnapshot), docId, revision)
  );
}

export function parseDocToMarkdownFromDocSnapshot(
  workspaceId: string,
  docId: string,
  docSnapshot: Uint8Array,
  aiEditable = false
): DocMarkdownContent {
  const docUrlPrefix = workspaceId ? `/workspace/${workspaceId}` : undefined;
  const parsed = parseYDocToMarkdown(
    Buffer.from(docSnapshot),
    docId,
    aiEditable,
    docUrlPrefix
  );

  return {
    title: parsed.title,
    markdown: parsed.markdown,
    knownUnsupportedBlocks: parsed.knownUnsupportedBlocks ?? [],
    unknownBlocks: parsed.unknownBlocks ?? [],
  };
}
