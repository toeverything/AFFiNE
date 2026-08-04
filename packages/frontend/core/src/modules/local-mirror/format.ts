import { sha } from '@blocksuite/global/utils';

import type { LocalMirrorDocMetadata } from './types';

export const LOCAL_MIRROR_METADATA_DIR = '.metadata';
export const LOCAL_MIRROR_WORKSPACE_PATH = `${LOCAL_MIRROR_METADATA_DIR}/workspace.json`;
export const LOCAL_MIRROR_BLOCK_MARKER_GRAMMAR_VERSION = 1 as const;
export const LOCAL_MIRROR_BLOCK_MARKER_PATTERN =
  /^<!-- affine-mirror:block id="([^"\r\n]+)" flavour="([^"\r\n]+)" -->$/;
export const LOCAL_MIRROR_EDITABLE_FLAVOURS: ReadonlySet<string> = new Set([
  'affine:paragraph',
  'affine:list',
  'affine:code',
  'affine:divider',
]);

const MAX_DOC_FILENAME_STEM_BYTES = 200;
const MAX_DOC_FILENAME_STEM_UTF16_UNITS = 200;
const WINDOWS_RESERVED_FILENAME =
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

function portableCaseFold(value: string) {
  return value.normalize('NFKC').toUpperCase().toLowerCase();
}

function truncateFilenameStem(value: string) {
  let result = '';
  let utf8Bytes = 0;
  let utf16Units = 0;
  for (const character of value) {
    const characterBytes = new TextEncoder().encode(character).byteLength;
    if (
      utf8Bytes + characterBytes > MAX_DOC_FILENAME_STEM_BYTES ||
      utf16Units + character.length > MAX_DOC_FILENAME_STEM_UTF16_UNITS
    ) {
      break;
    }
    result += character;
    utf8Bytes += characterBytes;
    utf16Units += character.length;
  }
  return result;
}

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

function shortStableId(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createMirrorDocFilename(title: string) {
  const normalized = title
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  const stem = truncateFilenameStem(normalized || 'Untitled').replace(
    /[.-]+$/g,
    ''
  );
  const safeStem = WINDOWS_RESERVED_FILENAME.test(stem) ? `_${stem}` : stem;
  return `${safeStem || 'Untitled'}.md`;
}

export function createMirrorDocPathMap(
  docs: readonly Pick<LocalMirrorDocMetadata, 'id' | 'title'>[]
) {
  const groups = new Map<string, typeof docs>();
  for (const doc of docs) {
    const key = portableCaseFold(createMirrorDocFilename(doc.title));
    groups.set(key, [...(groups.get(key) ?? []), doc]);
  }

  const paths = new Map<string, string>();
  const usedPaths = new Set<string>();
  for (const group of groups.values()) {
    if (group.length !== 1) continue;
    const path = `docs/${createMirrorDocFilename(group[0].title)}`;
    paths.set(group[0].id, path);
    usedPaths.add(portableCaseFold(path));
  }

  for (const group of groups.values()) {
    const sorted = [...group].sort((left, right) =>
      left.id.localeCompare(right.id)
    );
    if (sorted.length === 1) continue;
    for (const doc of sorted) {
      const filename = createMirrorDocFilename(doc.title);
      const stem = filename.slice(0, -'.md'.length);
      const base = `docs/${stem}--${shortStableId(doc.id)}`;
      let path = `${base}.md`;
      let disambiguator = 2;
      while (usedPaths.has(portableCaseFold(path))) {
        path = `${base}-${disambiguator}.md`;
        disambiguator++;
      }
      paths.set(doc.id, path);
      usedPaths.add(portableCaseFold(path));
    }
  }
  return paths;
}

export function getMirrorSnapshotPath(docId: string) {
  return `${LOCAL_MIRROR_METADATA_DIR}/snapshots/${encodeMirrorId(docId)}.snapshot.json`;
}

export function getMirrorBaselinePath(docId: string) {
  return `${LOCAL_MIRROR_METADATA_DIR}/baselines/${encodeMirrorId(docId)}.md`;
}

export function getMirrorBaselineDescriptorPath(docId: string) {
  return `${LOCAL_MIRROR_METADATA_DIR}/baselines/${encodeMirrorId(docId)}.json`;
}

export function createMirrorBlockMarker(id: string, flavour: string) {
  if (!id || !flavour || /["\r\n]/.test(id) || /["\r\n]/.test(flavour)) {
    throw new Error('Invalid local mirror block marker fields');
  }
  return `<!-- affine-mirror:block id="${id}" flavour="${flavour}" -->`;
}

export function createMirrorNewBlockMarker(token: string, flavour: string) {
  if (!token || /["\r\n]/.test(token)) {
    throw new Error('Invalid local mirror new-block token');
  }
  return createMirrorBlockMarker(`new:${token}`, flavour);
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
    'affineFormatVersion: 2',
    `markerGrammarVersion: ${LOCAL_MIRROR_BLOCK_MARKER_GRAMMAR_VERSION}`,
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
