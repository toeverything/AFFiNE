import type { DocSource } from '../../tools/types';
import type { EnrichedToolResultEvent } from './native-runtime-adapter';

export type AttachmentFootnote = {
  artifactId: string;
  fileName: string;
  fileType: string;
};

function pickAttachmentFootnote(value: unknown): AttachmentFootnote | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (record.source && typeof record.source === 'object') {
    const source = pickAttachmentFootnote(record.source);
    if (source) return source;
  }
  const artifactId =
    typeof record.artifactId === 'string'
      ? record.artifactId
      : typeof record.artifact_id === 'string'
        ? record.artifact_id
        : undefined;
  const fileName =
    typeof record.fileName === 'string'
      ? record.fileName
      : typeof record.name === 'string'
        ? record.name
        : 'Attachment';
  const fileType =
    typeof record.fileType === 'string'
      ? record.fileType
      : typeof record.mimeType === 'string'
        ? record.mimeType
        : typeof record.mime_type === 'string'
          ? record.mime_type
          : 'application/octet-stream';
  return artifactId ? { artifactId, fileName, fileType } : null;
}

export function collectAttachmentFootnotes(
  event: EnrichedToolResultEvent
): AttachmentFootnote[] {
  if (!['artifact_read', 'artifact_search'].includes(event.name)) return [];
  if (!event.output || typeof event.output !== 'object') return [];
  const output = event.output as Record<string, unknown>;
  if (event.name === 'artifact_search' && Array.isArray(output.hits)) {
    return output.hits
      .map(pickAttachmentFootnote)
      .filter((item): item is AttachmentFootnote => item !== null);
  }
  const item = pickAttachmentFootnote(output);
  return item ? [item] : [];
}

export function formatAttachmentFootnotes(
  attachments: AttachmentFootnote[],
  options: { includeReferences?: boolean } = {}
) {
  const references =
    options.includeReferences === false
      ? ''
      : attachments.map((_, index) => `[^attachment-${index + 1}]`).join('');
  const definitions = attachments
    .map(
      (attachment, index) =>
        `[^attachment-${index + 1}]: ${JSON.stringify({
          type: 'attachment',
          artifactId: attachment.artifactId,
          fileName: attachment.fileName,
          fileType: attachment.fileType,
        })}`
    )
    .join('\n');
  return references
    ? `\n\n${references}\n\n${definitions}`
    : `\n\n${definitions}`;
}

function pickDocumentFootnote(value: unknown): DocSource | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  if (source.type !== 'document') return null;
  const workspaceId = source.workspace_id ?? source.workspaceId;
  const docId = source.doc_id ?? source.docId;
  if (typeof workspaceId !== 'string' || typeof docId !== 'string') return null;
  const optional = (snake: string, camel: string) => {
    const candidate = source[snake] ?? source[camel];
    return typeof candidate === 'string' ? candidate : undefined;
  };
  return {
    type: 'document',
    workspace_id: workspaceId,
    doc_id: docId,
    title: typeof source.title === 'string' ? source.title : '',
    revision: optional('revision', 'revision'),
    visibility: optional('visibility', 'visibility') as
      | DocSource['visibility']
      | undefined,
    block_id: optional('block_id', 'blockId'),
    element_id: optional('element_id', 'elementId'),
    frame_id: optional('frame_id', 'frameId'),
  };
}

export function collectDocumentFootnotes(event: EnrichedToolResultEvent) {
  if (
    ![
      'doc_read',
      'doc_canvas_read',
      'doc_search',
      'frontend_read_selection',
      'frontend_read_nodes',
      'frontend_snapshot_document',
    ].includes(event.name)
  )
    return [];
  if (!event.output || typeof event.output !== 'object') return [];
  const output = event.output as Record<string, unknown>;
  const direct = pickDocumentFootnote(output.source);
  if (direct) return [direct];
  return Array.isArray(output.hits)
    ? output.hits
        .map(hit =>
          pickDocumentFootnote((hit as Record<string, unknown>)?.source)
        )
        .filter((source): source is DocSource => source !== null)
    : [];
}

export function formatDocumentFootnotes(documents: DocSource[]) {
  const unique = [
    ...new Map(documents.map(document => [document.doc_id, document])).values(),
  ];
  const references = unique.map((_, index) => `[^doc-${index + 1}]`).join('');
  const definitions = unique
    .map(
      (document, index) =>
        `[^doc-${index + 1}]: ${JSON.stringify({
          type: 'doc',
          docId: document.doc_id,
          ...(document.title ? { title: document.title } : {}),
        })}`
    )
    .join('\n');
  return `\n\n${references}\n\n${definitions}`;
}
