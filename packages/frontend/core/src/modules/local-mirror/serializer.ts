import {
  type BlockSnapshot,
  type DocSnapshot,
  DocSnapshotSchema,
  getAssetName,
  type Store,
} from '@blocksuite/affine/store';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import {
  type MarkdownAdapter,
  MarkdownAdapterFactoryIdentifier,
} from '@blocksuite/affine-shared/adapters';
import { Service } from '@toeverything/infra';

import {
  createMirrorBlockMarker,
  createMirrorFrontmatter,
  encodeMirrorId,
  getMirrorBaselineDescriptorPath,
  getMirrorBaselinePath,
  getMirrorSnapshotPath,
  hashText,
  LOCAL_MIRROR_EDITABLE_FLAVOURS,
  LOCAL_MIRROR_METADATA_DIR,
  stableJson,
} from './format';
import type {
  LocalMirrorBaselineDescriptor,
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
  ...LOCAL_MIRROR_EDITABLE_FLAVOURS,
  'affine:image',
  'affine:attachment',
  'affine:bookmark',
]);

type EditableDirectBlock = {
  block: BlockSnapshot;
  parentId: string;
  siblingIndex: number;
};

function getEditableDirectBlocks(snapshot: DocSnapshot) {
  const notes = snapshot.blocks.children.filter(
    block => block.flavour === 'affine:note'
  );
  const blocks: EditableDirectBlock[] = [];
  let hasProtectedContent =
    notes.length !== 1 || snapshot.blocks.children.length !== notes.length;
  for (const note of notes) {
    for (const [siblingIndex, block] of note.children.entries()) {
      if (
        block.id.startsWith('new:') ||
        block.children.length !== 0 ||
        !LOCAL_MIRROR_EDITABLE_FLAVOURS.has(block.flavour)
      ) {
        hasProtectedContent = true;
        continue;
      }
      blocks.push({ block, parentId: note.id, siblingIndex });
    }
  }
  return { blocks, hasProtectedContent };
}

function inspectSnapshot(snapshot: DocSnapshot) {
  const richFlavours = new Set<string>();
  const attachments: Array<{ sourceId: string; name: string }> = [];
  const visit = (block: BlockSnapshot) => {
    if (!MARKDOWN_FLAVOURS.has(block.flavour)) {
      richFlavours.add(block.flavour);
    }
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
  return { attachments, richFlavours: [...richFlavours].sort() };
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

    const { attachments, richFlavours } = inspectSnapshot(snapshot);
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

    const editableBlocks =
      metadata.primaryMode === 'page'
        ? getEditableDirectBlocks(snapshot)
        : null;
    const protectedReasons: string[] = [];
    if (!editableBlocks || editableBlocks.blocks.length === 0)
      protectedReasons.push('no editable direct leaf blocks');
    if (editableBlocks?.hasProtectedContent)
      protectedReasons.push('non-round-trippable block tree');
    if (metadata.primaryMode === 'edgeless') protectedReasons.push('edgeless');
    protectedReasons.push(...richFlavours.map(flavour => `rich:${flavour}`));
    let projectedBlocks: Array<
      EditableDirectBlock & { content: string }
    > | null = null;
    if (editableBlocks && editableBlocks.blocks.length > 0) {
      const adapter = doc
        .get(MarkdownAdapterFactoryIdentifier)
        .get(doc.getTransformer()) as MarkdownAdapter;
      projectedBlocks = [];
      for (const candidate of editableBlocks.blocks) {
        const model = doc.getModelById(candidate.block.id);
        const result = model ? await adapter.fromBlock(model) : undefined;
        if (!result) {
          protectedReasons.push(`cannot serialize ${candidate.block.flavour}`);
          continue;
        }
        projectedBlocks.push({ ...candidate, content: result.file.trimEnd() });
      }
      if (projectedBlocks.length > 0) {
        markdown = projectedBlocks
          .flatMap(({ block, content }) => [
            createMirrorBlockMarker(block.id, block.flavour),
            content,
          ])
          .join('\n\n');
      } else {
        projectedBlocks = null;
      }
    }
    if (
      !projectedBlocks &&
      (metadata.primaryMode === 'edgeless' || richFlavours.length > 0)
    ) {
      markdown += '\n\n## AFFiNE rich content\n';
      for (const flavour of richFlavours) {
        markdown += `\n> [!NOTE]\n> AFFiNE rich block \`${flavour}\` is preserved in the generated snapshot sidecar.\n`;
      }
      if (metadata.primaryMode === 'edgeless' && richFlavours.length === 0) {
        markdown +=
          '\n> [!NOTE]\n> AFFiNE canvas content is preserved in the generated snapshot sidecar.\n';
      }
    }

    const markdownPath = documentPath(metadata.id, docPaths);
    const canonicalMarkdown = `${createMirrorFrontmatter(
      doc.workspace.id,
      metadata,
      sourceHash
    )}${markdown.trimEnd()}\n`;
    const baselinePath = getMirrorBaselinePath(metadata.id);
    const descriptorBlocks = projectedBlocks
      ? await Promise.all(
          projectedBlocks.map(
            async ({ block, parentId, siblingIndex, content }) => {
              return {
                id: block.id,
                flavour: block.flavour,
                parentId,
                siblingIndex,
                projectionHash: await hashText(content),
                protected: false,
              };
            }
          )
        )
      : [];
    const descriptor: LocalMirrorBaselineDescriptor = {
      formatVersion: 2,
      docId: metadata.id,
      markdownPath,
      baselinePath,
      markerGrammarVersion: 1,
      sourceHash,
      protected: !projectedBlocks,
      protectedReasons: [...new Set(protectedReasons)],
      blocks: descriptorBlocks,
    };

    const files: LocalMirrorSerializedDocument['files'] = [
      {
        path: markdownPath,
        kind: 'markdown',
        content: canonicalMarkdown,
        docId: metadata.id,
        sourceHash,
      },
      {
        path: getMirrorSnapshotPath(metadata.id),
        kind: 'snapshot',
        content: snapshotJson,
        docId: metadata.id,
        sourceHash,
      },
      {
        path: baselinePath,
        kind: 'baseline',
        content: canonicalMarkdown,
        docId: metadata.id,
        sourceHash,
      },
      {
        path: getMirrorBaselineDescriptorPath(metadata.id),
        kind: 'baseline',
        content: stableJson(descriptor),
        docId: metadata.id,
        sourceHash,
      },
    ];

    return { docId: metadata.id, sourceHash, files, assets };
  }
}
