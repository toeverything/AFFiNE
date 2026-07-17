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
  getMirrorSnapshotPath,
  hashText,
  LOCAL_MIRROR_METADATA_DIR,
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

function rewriteDocumentLinks(
  markdown: string,
  docPaths: ReadonlyMap<string, string>
) {
  let output = markdown;
  for (const [docId, path] of docPaths) {
    const source = `affine-mirror://doc/${docId}`;
    const target = `./${path.replace(/^docs\//, '')}`;
    output = output.replaceAll(source, target);
  }
  return output;
}

function documentPath(docId: string, docPaths: ReadonlyMap<string, string>) {
  const path = docPaths.get(docId);
  if (!path) throw new Error(`Missing local mirror path for ${docId}`);
  return path;
}

export class LocalMirrorSerializer extends Service {
  async serialize(
    doc: Store,
    metadata: LocalMirrorDocMetadata,
    docPaths: ReadonlyMap<string, string>
  ): Promise<LocalMirrorSerializedDocument> {
    const serialized = await MarkdownTransformer.serializeDoc(doc, {
      docLinkBaseUrl: 'affine-mirror://doc',
      loadAssets: false,
    });
    if (!serialized) {
      throw new Error(`Failed to serialize AFFiNE document ${metadata.id}`);
    }

    const snapshot = DocSnapshotSchema.parse(serialized.snapshot);
    const snapshotJson = stableJson(snapshot);
    const sourceHash = await hashText(stableJson({ snapshot, metadata }));
    let markdown = rewriteDocumentLinks(serialized.file, docPaths);
    const files: LocalMirrorSerializedDocument['files'] = [];
    const assets: LocalMirrorSerializedDocument['assets'] = [];
    const assetPaths = new Map<string, string>();

    for (const assetId of [...new Set(serialized.assetsIds)].sort()) {
      const blob =
        serialized.assets.get(assetId) ?? (await doc.blobSync.get(assetId));
      if (!blob) {
        throw new Error(
          `Document ${metadata.id} references unavailable asset ${assetId}`
        );
      }
      const exportedName = getAssetName(
        serialized.assets.has(assetId)
          ? serialized.assets
          : new Map([[assetId, blob]]),
        assetId
      );
      const mirrorName = `${encodeMirrorId(assetId)}.${extensionFromName(exportedName)}`;
      const relativeAssetPath = `../${LOCAL_MIRROR_METADATA_DIR}/assets/${mirrorName}`;
      assetPaths.set(assetId, relativeAssetPath);
      markdown = markdown.replaceAll(
        `assets/${exportedName}`,
        relativeAssetPath
      );
      assets.push({
        assetId,
        path: `${LOCAL_MIRROR_METADATA_DIR}/assets/${mirrorName}`,
        kind: 'asset',
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
        path: documentPath(metadata.id, docPaths),
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

    return { docId: metadata.id, sourceHash, files, assets };
  }
}
