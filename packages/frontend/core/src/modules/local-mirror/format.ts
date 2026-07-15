import { sha } from '@blocksuite/global/utils';

import type { LocalMirrorDocMetadata } from './types';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    );
  }
  return value;
}

export function stableJson(value: unknown) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export async function hashText(value: string) {
  const bytes = new TextEncoder().encode(value);
  return sha(bytes.buffer);
}

export function encodeMirrorId(id: string) {
  return encodeURIComponent(id).replace(
    /[!'()*]/g,
    character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

export function getMirrorDocPath(docId: string) {
  return `docs/${encodeMirrorId(docId)}.md`;
}

export function getMirrorSnapshotPath(docId: string) {
  return `snapshots/${encodeMirrorId(docId)}.snapshot.json`;
}

function yamlScalar(value: unknown) {
  return JSON.stringify(value ?? null);
}

export function createMirrorFrontmatter(
  workspaceId: string,
  metadata: LocalMirrorDocMetadata,
  sourceHash: string
) {
  return [
    '---',
    'affineFormatVersion: 1',
    `workspaceId: ${yamlScalar(workspaceId)}`,
    `docId: ${yamlScalar(metadata.id)}`,
    `title: ${yamlScalar(metadata.title)}`,
    `createdAt: ${yamlScalar(
      metadata.createDate !== undefined
        ? new Date(metadata.createDate).toISOString()
        : null
    )}`,
    `updatedAt: ${yamlScalar(
      metadata.updatedDate !== undefined
        ? new Date(metadata.updatedDate).toISOString()
        : null
    )}`,
    `trashed: ${metadata.trash === true}`,
    `primaryMode: ${yamlScalar(metadata.primaryMode)}`,
    `tags: ${yamlScalar(metadata.tags)}`,
    `sourceHash: ${yamlScalar(sourceHash)}`,
    'generated: true',
    '---',
    '',
  ].join('\n');
}
