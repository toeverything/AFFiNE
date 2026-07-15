import {
  type BlockSnapshot,
  type DocSnapshot,
  DocSnapshotSchema,
  getAssetName,
  type Store,
} from '@blocksuite/affine/store';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { Service } from '@toeverything/infra';

import {
  createMirrorFrontmatter,
  encodeMirrorId,
  getMirrorDocPath,
  getMirrorSnapshotPath,
  hashText,
  stableJson,
} from './format';
import type {
  LocalMirrorDocMetadata,
  LocalMirrorSerializedDocument,
} from './types';

function extensionFromName(name: string) {
  const extension = name.split('.').at(-1)?.toLowerCase() ?? 'blob';
  return /^[a-z0-9]{1,12}$/.test(extension) ? extension : 'blob';
}

const MARKDOWN_FLAVOURS = new Set([
  'affine:page',
  'affine:note',
  'affine:paragraph',
  'affine:list',
  'affine:code',
  'affine:divider',
  'affine:image',
  'affine:attachment',
  'affine:bookmark',
]);

export function collectRichOnlyFlavours(snapshot: DocSnapshot) {
  const flavours = new Set<string>();
  const visit = (block: BlockSnapshot) => {
    if (!MARKDOWN_FLAVOURS.has(block.flavour)) flavours.add(block.flavour);
    block.children.forEach(visit);
  };
  visit(snapshot.blocks);
  return [...flavours].sort();
}

function collectAttachments(snapshot: DocSnapshot) {
  const attachments: Array<{ sourceId: string; name: string }> = [];
  const visit = (block: BlockSnapshot) => {
    const sourceId = block.props.sourceId;
    if (block.flavour === 'affine:attachment' && typeof sourceId === 'string') {
      attachments.push({
        sourceId,
        name:
          typeof block.props.name === 'string' && block.props.name.length > 0
            ? block.props.name
            : 'Attachment',
      });
    }
    block.children.forEach(visit);
  };
  visit(snapshot.blocks);
  return attachments;
}

function rewriteDocumentLinks(markdown: string, docIds: readonly string[]) {
  let output = markdown;
  for (const docId of docIds) {
    const source = `affine-mirror://doc/${docId}`;
    const target = `./${encodeMirrorId(docId)}.md`;
    output = output.replaceAll(source, target);
  }
  return output;
}

export class LocalMirrorSerializer extends Service {
  async serialize(
    doc: Store,
    metadata: LocalMirrorDocMetadata,
    allDocIds: readonly string[]
  ): Promise<LocalMirrorSerializedDocument> {
    const serialized = await MarkdownTransformer.serializeDoc(doc, {
      docLinkBaseUrl: 'affine-mirror://doc',
    });
    if (!serialized) {
      throw new Error(`Failed to serialize AFFiNE document ${metadata.id}`);
    }

    const snapshot = DocSnapshotSchema.parse(serialized.snapshot);
    const snapshotJson = stableJson(snapshot);
    const sourceHash = await hashText(stableJson({ snapshot, metadata }));
    let markdown = rewriteDocumentLinks(serialized.file, allDocIds);
    const files: LocalMirrorSerializedDocument['files'] = [];
    const assetPaths = new Map<string, string>();

    for (const assetId of [...new Set(serialized.assetsIds)].sort()) {
      const blob = serialized.assets.get(assetId);
      if (!blob) {
        throw new Error(
          `Document ${metadata.id} references unavailable asset ${assetId}`
        );
      }
      const exportedName = getAssetName(serialized.assets, assetId);
      const mirrorName = `${encodeMirrorId(assetId)}.${extensionFromName(exportedName)}`;
      assetPaths.set(assetId, `../assets/${mirrorName}`);
      markdown = markdown.replaceAll(
        `assets/${exportedName}`,
        `../assets/${mirrorName}`
      );
      files.push({
        path: `assets/${mirrorName}`,
        kind: 'asset',
        content: new Uint8Array(await blob.arrayBuffer()),
        docId: metadata.id,
      });
    }

    const attachments = collectAttachments(snapshot);
    if (attachments.length > 0) {
      markdown += '\n\n## Attachments\n';
      for (const attachment of attachments) {
        const path = assetPaths.get(attachment.sourceId);
        markdown += path
          ? `\n- [${attachment.name.replace(/([\\[\]])/g, '\\$1')}](${path})`
          : `\n- ${attachment.name} _(asset unavailable)_`;
      }
      markdown += '\n';
    }

    const richFlavours = collectRichOnlyFlavours(snapshot);
    if (metadata.primaryMode === 'edgeless' || richFlavours.length > 0) {
      markdown += '\n\n## AFFiNE rich content\n';
      for (const flavour of richFlavours) {
        markdown += `\n> [!NOTE]\n> AFFiNE rich block \`${flavour}\` is preserved in the generated snapshot sidecar.\n`;
      }
      if (metadata.primaryMode === 'edgeless' && richFlavours.length === 0) {
        markdown +=
          '\n> [!NOTE]\n> AFFiNE canvas content is preserved in the generated snapshot sidecar.\n';
      }
    }

    files.unshift(
      {
        path: getMirrorDocPath(metadata.id),
        kind: 'markdown',
        content: `${createMirrorFrontmatter(
          doc.workspace.id,
          metadata,
          sourceHash
        )}${markdown.trimEnd()}\n`,
        docId: metadata.id,
        sourceHash,
      },
      {
        path: getMirrorSnapshotPath(metadata.id),
        kind: 'snapshot',
        content: snapshotJson,
        docId: metadata.id,
        sourceHash,
      }
    );

    return { docId: metadata.id, sourceHash, files };
  }
}
