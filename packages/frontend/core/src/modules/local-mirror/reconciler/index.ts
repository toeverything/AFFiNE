import { type Store, Text } from '@blocksuite/affine/store';
import {
  type MarkdownAdapter,
  MarkdownAdapterFactoryIdentifier,
} from '@blocksuite/affine-shared/adapters';

import {
  LOCAL_MIRROR_BLOCK_MARKER_PATTERN,
  LOCAL_MIRROR_EDITABLE_FLAVOURS,
} from '../format';

const MAX_MARKDOWN_BYTES = 4 * 1024 * 1024;
const FRONTMATTER_KEYS = [
  'affineFormatVersion',
  'markerGrammarVersion',
  'workspaceId',
  'docId',
  'title',
  'createdAt',
  'updatedAt',
  'trashed',
  'primaryMode',
  'tags',
  'sourceHash',
  'generated',
] as const;

export type MirrorBlock = {
  id: string;
  flavour: string;
  content: string;
};

export type MirrorProjection = {
  workspaceId: string;
  docId: string;
  title: string;
  sourceHash: string;
  blocks: MirrorBlock[];
};

export type MirrorOperation =
  | { type: 'update'; block: MirrorBlock }
  | { type: 'delete'; id: string }
  | { type: 'insert'; block: MirrorBlock; afterId: string | null };

export type ReconcileResult =
  | { type: 'apply'; operations: MirrorOperation[]; title?: string }
  | { type: 'noop' }
  | { type: 'conflict'; reason: string }
  | { type: 'unsupported'; reason: string };

type PreparedProps = Record<string, unknown>;
type PreparedOperation =
  | { type: 'update'; id: string; props: PreparedProps }
  | { type: 'delete'; id: string }
  | {
      type: 'insert';
      token: string;
      id: string;
      flavour: string;
      props: PreparedProps;
      afterId: string | null;
    };

export type PreparedMirrorPatch = {
  parentId: string;
  operations: PreparedOperation[];
};

export class LocalMirrorPermissionError extends Error {
  override name = 'LocalMirrorPermissionError';
}

export class LocalMirrorSourceRaceError extends Error {
  override name = 'LocalMirrorSourceRaceError';
}

function invalid(message: string): never {
  throw new Error(`Invalid local mirror Markdown: ${message}`);
}

function parseJsonField(fields: ReadonlyMap<string, string>, name: string) {
  try {
    return JSON.parse(fields.get(name) ?? '');
  } catch {
    return invalid(`${name} is not valid JSON`);
  }
}

function parseStringField(fields: ReadonlyMap<string, string>, name: string) {
  const value: unknown = parseJsonField(fields, name);
  if (typeof value !== 'string') invalid(`${name} must be a string`);
  return value;
}

function validateGeneratedFields(fields: ReadonlyMap<string, string>) {
  const createdAt = parseJsonField(fields, 'createdAt');
  const updatedAt = parseJsonField(fields, 'updatedAt');
  const tags = parseJsonField(fields, 'tags');
  if (createdAt !== null && typeof createdAt !== 'string') {
    invalid('createdAt must be a string or null');
  }
  if (updatedAt !== null && typeof updatedAt !== 'string') {
    invalid('updatedAt must be a string or null');
  }
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) {
    invalid('tags must be an array of strings');
  }
  if (fields.get('trashed') !== 'true' && fields.get('trashed') !== 'false') {
    invalid('trashed must be a boolean');
  }
  const primaryMode = parseStringField(fields, 'primaryMode');
  if (primaryMode !== 'page' && primaryMode !== 'edgeless') {
    invalid('primaryMode is invalid');
  }
}

/** Parses only the exact generated v2 subset; arbitrary YAML is never evaluated. */
export function parseMirrorMarkdown(markdown: string): MirrorProjection {
  if (new TextEncoder().encode(markdown).byteLength > MAX_MARKDOWN_BYTES) {
    invalid('file is too large');
  }
  if (markdown.includes('\u0000')) invalid('file contains NUL');
  const lines = markdown.replaceAll('\r\n', '\n').split('\n');
  if (lines.shift() !== '---') invalid('frontmatter is missing');

  const fields = new Map<string, string>();
  let frontmatterClosed = false;
  while (lines.length > 0) {
    const line = lines.shift();
    if (line === '---') {
      frontmatterClosed = true;
      break;
    }
    const match = /^([A-Za-z][A-Za-z0-9]*): (.+)$/.exec(line ?? '');
    if (!match || fields.has(match[1])) {
      invalid('frontmatter contains an invalid or duplicate key');
    }
    fields.set(match[1], match[2]);
  }
  if (
    !frontmatterClosed ||
    fields.size !== FRONTMATTER_KEYS.length ||
    FRONTMATTER_KEYS.some(key => !fields.has(key))
  ) {
    invalid('frontmatter fields do not match format v2');
  }
  if (
    fields.get('affineFormatVersion') !== '2' ||
    fields.get('markerGrammarVersion') !== '1' ||
    fields.get('generated') !== 'true'
  ) {
    invalid('generated control fields are unsupported');
  }
  validateGeneratedFields(fields);

  const blocks: MirrorBlock[] = [];
  const ids = new Set<string>();
  let current: MirrorBlock | null = null;
  for (const line of lines) {
    const marker = line.match(LOCAL_MIRROR_BLOCK_MARKER_PATTERN);
    if (marker) {
      if (current) {
        current.content = current.content.trimEnd();
        blocks.push(current);
      }
      const [, id, flavour] = marker;
      const validStableId = !id.startsWith('new:') && !/\s/.test(id);
      const validNewId =
        id.startsWith('new:') &&
        /^[A-Za-z0-9_-]{1,128}$/.test(id.slice('new:'.length));
      if (
        !LOCAL_MIRROR_EDITABLE_FLAVOURS.has(flavour) ||
        (!validStableId && !validNewId) ||
        ids.has(id)
      ) {
        invalid('block marker is invalid or duplicated');
      }
      ids.add(id);
      current = { id, flavour, content: '' };
    } else if (current) {
      current.content += `${line}\n`;
    } else if (line.trim().length > 0) {
      invalid('content appears outside a block marker');
    }
  }
  if (current) {
    current.content = current.content.trimEnd();
    blocks.push(current);
  }

  return {
    workspaceId: parseStringField(fields, 'workspaceId'),
    docId: parseStringField(fields, 'docId'),
    title: parseStringField(fields, 'title'),
    sourceHash: parseStringField(fields, 'sourceHash'),
    blocks,
  };
}

function sameBlock(left?: MirrorBlock, right?: MirrorBlock) {
  return left?.flavour === right?.flavour && left?.content === right?.content;
}

function stableBlocks(projection: MirrorProjection) {
  return projection.blocks.filter(block => !block.id.startsWith('new:'));
}

export function planMirrorReconciliation(
  base: MirrorProjection,
  local: MirrorProjection,
  remote: MirrorProjection
): ReconcileResult {
  if (
    base.workspaceId !== local.workspaceId ||
    base.docId !== local.docId ||
    base.workspaceId !== remote.workspaceId ||
    base.docId !== remote.docId ||
    local.sourceHash !== base.sourceHash
  ) {
    return { type: 'conflict', reason: 'identity or source field changed' };
  }

  const baseById = new Map(base.blocks.map(block => [block.id, block]));
  const localById = new Map(local.blocks.map(block => [block.id, block]));
  const remoteById = new Map(remote.blocks.map(block => [block.id, block]));
  const localStable = stableBlocks(local);
  if (localStable.some(block => !baseById.has(block.id))) {
    return { type: 'unsupported', reason: 'unknown stable block marker' };
  }
  const expectedLocalOrder = base.blocks
    .filter(block => localById.has(block.id))
    .map(block => block.id);
  if (
    localStable.some((block, index) => block.id !== expectedLocalOrder[index])
  ) {
    return {
      type: 'unsupported',
      reason: 'local block reorder is unsupported',
    };
  }

  const operations: MirrorOperation[] = [];
  for (const baseBlock of base.blocks) {
    const localBlock = localById.get(baseBlock.id);
    const remoteBlock = remoteById.get(baseBlock.id);
    if (localBlock && localBlock.flavour !== baseBlock.flavour) {
      return {
        type: 'conflict',
        reason: `block flavour changed: ${baseBlock.id}`,
      };
    }
    const localChanged = !sameBlock(baseBlock, localBlock);
    const remoteChanged = !sameBlock(baseBlock, remoteBlock);
    if (localChanged && remoteChanged && !sameBlock(localBlock, remoteBlock)) {
      return {
        type: 'conflict',
        reason: `same block changed: ${baseBlock.id}`,
      };
    }
    if (localChanged && !sameBlock(localBlock, remoteBlock)) {
      operations.push(
        localBlock
          ? { type: 'update', block: localBlock }
          : { type: 'delete', id: baseBlock.id }
      );
    }
  }

  for (const [index, block] of local.blocks.entries()) {
    if (!block.id.startsWith('new:')) continue;
    const previous = local.blocks[index - 1];
    operations.push({
      type: 'insert',
      block,
      afterId: previous?.id ?? null,
    });
  }

  const localTitleChanged = local.title !== base.title;
  const remoteTitleChanged = remote.title !== base.title;
  if (localTitleChanged && remoteTitleChanged && local.title !== remote.title) {
    return { type: 'conflict', reason: 'title changed on both sides' };
  }
  const title =
    localTitleChanged && local.title !== remote.title ? local.title : undefined;
  if (operations.length === 0 && title === undefined) return { type: 'noop' };
  return { type: 'apply', operations, title };
}

function textFromSnapshot(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    !Array.isArray((value as { delta?: unknown }).delta)
  ) {
    throw new Error('Markdown block text is invalid');
  }
  return new Text((value as { delta: Array<{ insert: string }> }).delta);
}

function allowlistedProps(flavour: string, props: Record<string, unknown>) {
  if (flavour === 'affine:divider') return {};
  const text = textFromSnapshot(props.text);
  if (flavour === 'affine:paragraph') {
    if (
      !['text', 'quote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(
        String(props.type)
      )
    ) {
      throw new Error('Paragraph type is unsupported');
    }
    return { text, type: props.type };
  }
  if (flavour === 'affine:list') {
    if (!['bulleted', 'numbered', 'todo'].includes(String(props.type))) {
      throw new Error('List type is unsupported');
    }
    if (typeof props.checked !== 'boolean') {
      throw new Error('List checked state is invalid');
    }
    return {
      text,
      type: props.type,
      checked: props.checked,
      order: typeof props.order === 'number' ? props.order : null,
    };
  }
  if (flavour === 'affine:code') {
    if (props.language !== null && typeof props.language !== 'string') {
      throw new Error('Code language is invalid');
    }
    return { text, language: props.language };
  }
  throw new Error(`Unsupported mirror block flavour: ${flavour}`);
}

async function prepareBlock(
  adapter: MarkdownAdapter,
  block: MirrorBlock
): Promise<PreparedProps> {
  const snapshot = await adapter.toBlockSnapshot({ file: block.content });
  if (
    snapshot.children.length !== 1 ||
    snapshot.children[0].children.length !== 0 ||
    snapshot.children[0].flavour !== block.flavour
  ) {
    throw new Error('Markdown must produce one matching leaf block');
  }
  return allowlistedProps(block.flavour, snapshot.children[0].props);
}

/** Completes every fallible conversion and state check before mutation. */
export async function prepareMirrorApply(
  doc: Store,
  parentId: string,
  operations: MirrorOperation[],
  expectedParentIds?: ReadonlyMap<string, string>
): Promise<PreparedMirrorPatch> {
  if (doc.readonly) throw new Error('Document is read-only');
  const parent = doc.getModelById(parentId);
  if (!parent || parent.flavour !== 'affine:note') {
    throw new Error('Mirror body note is unavailable');
  }
  const adapter = doc
    .get(MarkdownAdapterFactoryIdentifier)
    .get(doc.getTransformer()) as MarkdownAdapter;
  const currentIds = new Set(parent.children.map(child => child.id));
  const newTokens = new Set<string>();
  const deletedIds = new Set(
    operations
      .filter(operation => operation.type === 'delete')
      .map(operation => operation.id)
  );
  const prepared: PreparedOperation[] = [];

  for (const operation of operations) {
    if (operation.type === 'delete') {
      const model = doc.getModelById(operation.id);
      const expectedParent = doc.getModelById(
        expectedParentIds?.get(operation.id) ?? parentId
      );
      if (
        !model ||
        !expectedParent?.children.some(child => child.id === operation.id) ||
        model.children.length > 0 ||
        !LOCAL_MIRROR_EDITABLE_FLAVOURS.has(model.flavour)
      ) {
        throw new Error(`Cannot delete mirror block ${operation.id}`);
      }
      prepared.push(operation);
      continue;
    }
    const props = await prepareBlock(adapter, operation.block);
    if (operation.type === 'update') {
      const model = doc.getModelById(operation.block.id);
      const expectedParent = doc.getModelById(
        expectedParentIds?.get(operation.block.id) ?? parentId
      );
      if (
        !model ||
        !expectedParent?.children.some(
          child => child.id === operation.block.id
        ) ||
        model.children.length > 0 ||
        model.flavour !== operation.block.flavour
      ) {
        throw new Error(`Cannot update mirror block ${operation.block.id}`);
      }
      prepared.push({ type: 'update', id: operation.block.id, props });
      continue;
    }
    if (
      !operation.block.id.startsWith('new:') ||
      newTokens.has(operation.block.id)
    ) {
      throw new Error('New mirror block token is invalid or duplicated');
    }
    if (operation.afterId && deletedIds.has(operation.afterId)) {
      throw new Error('Mirror insertion anchor is scheduled for deletion');
    }
    if (
      operation.afterId &&
      !currentIds.has(operation.afterId) &&
      !newTokens.has(operation.afterId)
    ) {
      throw new Error(`Insertion anchor is unavailable: ${operation.afterId}`);
    }
    newTokens.add(operation.block.id);
    let id = doc.workspace.idGenerator();
    while (doc.getModelById(id) || currentIds.has(id)) {
      id = doc.workspace.idGenerator();
    }
    currentIds.add(id);
    prepared.push({
      type: 'insert',
      token: operation.block.id,
      id,
      flavour: operation.block.flavour,
      props,
      afterId: operation.afterId,
    });
  }
  return { parentId, operations: prepared };
}

/** Applies only a fully prepared patch; it performs no async/fallible conversion. */
export function applyPreparedMirrorPatch(
  doc: Store,
  patch: PreparedMirrorPatch
) {
  const parent = doc.getModelById(patch.parentId);
  if (!parent || parent.flavour !== 'affine:note' || doc.readonly) {
    throw new Error('Mirror apply preconditions changed');
  }
  const insertedIds = new Map<string, string>();
  doc.captureSync();
  try {
    doc.transact(() => {
      for (const operation of patch.operations) {
        if (operation.type === 'update') {
          doc.updateBlock(operation.id, operation.props);
        } else if (operation.type === 'delete') {
          doc.deleteBlock(operation.id);
        } else {
          const anchorId = operation.afterId
            ? (insertedIds.get(operation.afterId) ?? operation.afterId)
            : null;
          const anchorIndex = anchorId
            ? parent.children.findIndex(child => child.id === anchorId)
            : -1;
          if (anchorId && anchorIndex < 0) {
            throw new Error(`Mirror insertion anchor disappeared: ${anchorId}`);
          }
          doc.addBlock(
            operation.flavour,
            { id: operation.id, ...operation.props },
            parent.id,
            anchorIndex + 1
          );
          insertedIds.set(operation.token, operation.id);
        }
      }
    });
  } finally {
    doc.captureSync();
  }
}

export async function applyMirrorReconciliation(options: {
  doc: Store;
  parentId: string;
  result: Extract<ReconcileResult, { type: 'apply' }>;
  expectedParentIds?: ReadonlyMap<string, string>;
  canUpdate: () => Promise<boolean>;
  sourceStillCurrent: () => Promise<boolean> | boolean;
  changeTitle: (title: string) => Promise<void> | void;
}) {
  const prepared = await prepareMirrorApply(
    options.doc,
    options.parentId,
    options.result.operations,
    options.expectedParentIds
  );
  if (!(await options.canUpdate())) {
    throw new LocalMirrorPermissionError('Document update permission denied');
  }
  if (!(await options.sourceStillCurrent())) {
    throw new LocalMirrorSourceRaceError(
      'AFFiNE document changed while applying the mirror edit'
    );
  }
  if (prepared.operations.length > 0) {
    applyPreparedMirrorPatch(options.doc, prepared);
  }
  if (options.result.title !== undefined) {
    await options.changeTitle(options.result.title);
  }
}
