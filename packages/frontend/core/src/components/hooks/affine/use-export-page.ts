import { notify } from '@affine/component';
import {
  pushGlobalLoadingEventAtom,
  resolveGlobalLoadingEventAtom,
} from '@affine/component/global-loading';
import type { AffineEditorContainer } from '@affine/core/blocksuite/block-suite-editor/blocksuite-editor';
import { EditorService } from '@affine/core/modules/editor';
import { getAFFiNEWorkspaceSchema } from '@affine/core/modules/workspace/global-schema';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { buildFramePngPayload } from '@blocksuite/affine/blocks/frame';
import { ExportManager } from '@blocksuite/affine/blocks/surface';
import {
  FrameBlockModel,
  FrameBlockSchema,
  SurfaceRefBlockModel,
} from '@blocksuite/affine/model';
import {
  docLinkBaseURLMiddleware,
  embedSyncedDocMiddleware,
  HtmlAdapterFactoryIdentifier,
  MarkdownAdapterFactoryIdentifier,
  titleMiddleware,
} from '@blocksuite/affine/shared/adapters';
import { printToPdf } from '@blocksuite/affine/shared/utils';
import type { BlockStdScope } from '@blocksuite/affine/std';
import {
  getAssetName,
  type Store,
  Transformer,
} from '@blocksuite/affine/store';
import {
  createAssetsArchive,
  download,
  HtmlTransformer,
  MarkdownTransformer,
  PdfTransformer,
  ZipTransformer,
} from '@blocksuite/affine/widgets/linked-doc';
import { nextTick, sha } from '@blocksuite/global/utils';
import { useLiveData, useService } from '@toeverything/infra';
import { useSetAtom } from 'jotai';
import { nanoid } from 'nanoid';

import { useAsyncCallback } from '../affine-async-hooks';

type ExportType =
  | 'pdf'
  | 'html'
  | 'png'
  | 'markdown'
  | 'snapshot'
  | 'pdf-export';

interface ExportHandlerOptions {
  page: Store;
  editorContainer: AffineEditorContainer;
  type: ExportType;
}

interface AdapterResult {
  file: string;
  assetsIds: string[];
}

type FrameAsset = {
  id: string;
  frameId: string;
  name: string;
  alt: string;
};

type SurfaceRefPreview = HTMLElement & {
  referenceModel?: unknown;
  previewEditor?: { std?: BlockStdScope } | null;
};

function setFrameExportConfigs(
  transformer: Transformer,
  frameAssets: FrameAsset[],
  referencedFrameIds: string[]
) {
  if (!frameAssets.length) return;
  const imageMap = Object.fromEntries(
    frameAssets.map(asset => [asset.frameId, asset])
  );
  transformer.adapterConfigs.set(
    'frame:export:image-map',
    JSON.stringify(imageMap)
  );
  transformer.adapterConfigs.set(
    'frame:export:surface-ref-ids',
    JSON.stringify(referencedFrameIds)
  );
  transformer.adapterConfigs.set('surface:exportFramesAsImages', 'true');
}

function collectReferencedFrameIds(doc: Store) {
  const surfaceRefs = doc
    .getBlocksByFlavour('affine:surface-ref')
    .map(block => block.model)
    .filter(
      (model): model is SurfaceRefBlockModel =>
        model instanceof SurfaceRefBlockModel
    );

  const referenced = new Set<string>();
  for (const model of surfaceRefs) {
    if (model.props.refFlavour !== FrameBlockSchema.model.flavour) continue;
    const reference = model.props.reference;
    if (reference) referenced.add(reference);
  }
  return [...referenced];
}

function ensureUniqueFileName(name: string, used: Set<string>) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dotIndex = name.lastIndexOf('.');
  const base = dotIndex >= 0 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex >= 0 ? name.slice(dotIndex) : '';
  let count = 2;
  let candidate = `${base}-${count}${ext}`;
  while (used.has(candidate)) {
    count += 1;
    candidate = `${base}-${count}${ext}`;
  }
  used.add(candidate);
  return candidate;
}

function normalizeAssetFileName(name: string) {
  const trimmed = name.trim();
  const dotIndex = trimmed.lastIndexOf('.');
  const base = dotIndex >= 0 ? trimmed.slice(0, dotIndex) : trimmed;
  const ext = dotIndex >= 0 ? trimmed.slice(dotIndex) : '';
  const normalizedBase = base.replace(/\s+/g, '-');
  return `${normalizedBase}${ext}`;
}

async function collectFrameAssets(
  doc: Store,
  std: BlockStdScope,
  transformer: Transformer,
  frameIds?: string[]
) {
  const assets = transformer.assets;
  const renderStdMap = new Map<string, BlockStdScope>();
  document.querySelectorAll('affine-surface-ref').forEach(node => {
    const surfaceRef = node as SurfaceRefPreview;
    if (!surfaceRef.previewEditor?.std) return;
    const referenceModel = surfaceRef.referenceModel;
    if (referenceModel instanceof FrameBlockModel) {
      renderStdMap.set(referenceModel.id, surfaceRef.previewEditor.std);
    }
  });
  const frames = doc
    .getBlocksByFlavour('affine:frame')
    .map(block => block.model)
    .filter(
      (model): model is FrameBlockModel => model instanceof FrameBlockModel
    );
  const filteredFrames = frameIds?.length
    ? frames.filter(frame => frameIds.includes(frame.id))
    : frames;
  if (!filteredFrames.length) {
    return [] as FrameAsset[];
  }

  const usedNames = new Set<string>();
  const assetsList: FrameAsset[] = [];
  for (const frame of filteredFrames) {
    const renderStd = renderStdMap.get(frame.id);
    const payload = await buildFramePngPayload(std, frame, renderStd);
    if (!payload) continue;

    const normalizedName = normalizeAssetFileName(payload.fileName);
    const fileName = ensureUniqueFileName(normalizedName, usedNames);
    const buffer = await payload.blob.arrayBuffer();
    const blobId = await sha(buffer);
    const file = new File([buffer], fileName, { type: 'image/png' });
    assets.set(blobId, file);

    assetsList.push({
      id: blobId,
      frameId: frame.id,
      name: getAssetName(assets, blobId),
      alt: frame.props.title?.toString()?.trim() || 'Frame',
    });
    await nextTick();
  }

  return assetsList;
}

async function exportMarkdownWithFrames(doc: Store, std: BlockStdScope) {
  const transformer = new Transformer({
    schema: getAFFiNEWorkspaceSchema(),
    blobCRUD: doc.workspace.blobSync,
    docCRUD: {
      create: (id: string) => doc.workspace.createDoc(id).getStore({ id }),
      get: (id: string) => doc.workspace.getDoc(id)?.getStore({ id }) ?? null,
      delete: (id: string) => doc.workspace.removeDoc(id),
    },
    middlewares: [
      docLinkBaseURLMiddleware(doc.workspace.id),
      titleMiddleware(doc.workspace.meta.docMetas),
      embedSyncedDocMiddleware('content'),
    ],
  });

  const referencedFrameIds = collectReferencedFrameIds(doc);
  const frameAssets = await collectFrameAssets(
    doc,
    std,
    transformer,
    referencedFrameIds
  );
  setFrameExportConfigs(transformer, frameAssets, referencedFrameIds);

  const adapterFactory = std.store.provider.get(
    MarkdownAdapterFactoryIdentifier
  );
  const adapter = adapterFactory.get(transformer);
  const result = (await adapter.fromDoc(doc)) as AdapterResult;

  if (
    !result ||
    (!result.file && !result.assetsIds.length && !frameAssets.length)
  ) {
    return;
  }
  const assetsIds = [
    ...new Set([...result.assetsIds, ...frameAssets.map(asset => asset.id)]),
  ];

  const docTitle = doc.meta?.title || 'Untitled';
  const contentBlob = new Blob([result.file], { type: 'text/plain' });
  const indexFileName = `${docTitle}.md`;

  let downloadBlob: Blob;
  let name: string;

  if (assetsIds.length > 0) {
    const zip = await createAssetsArchive(transformer.assets, assetsIds);
    await zip.file(indexFileName, contentBlob);
    downloadBlob = await zip.generate();
    name = `${docTitle}.zip`;
  } else {
    downloadBlob = contentBlob;
    name = `${docTitle}.md`;
  }

  download(downloadBlob, name);
}

async function exportHtmlWithFrames(doc: Store, std: BlockStdScope) {
  const transformer = new Transformer({
    schema: getAFFiNEWorkspaceSchema(),
    blobCRUD: doc.workspace.blobSync,
    docCRUD: {
      create: (id: string) => doc.workspace.createDoc(id).getStore({ id }),
      get: (id: string) => doc.workspace.getDoc(id)?.getStore({ id }) ?? null,
      delete: (id: string) => doc.workspace.removeDoc(id),
    },
    middlewares: [
      docLinkBaseURLMiddleware(doc.workspace.id),
      titleMiddleware(doc.workspace.meta.docMetas),
      embedSyncedDocMiddleware('content'),
    ],
  });

  const referencedFrameIds = collectReferencedFrameIds(doc);
  const frameAssets = await collectFrameAssets(
    doc,
    std,
    transformer,
    referencedFrameIds
  );
  setFrameExportConfigs(transformer, frameAssets, referencedFrameIds);

  const adapterFactory = std.store.provider.get(HtmlAdapterFactoryIdentifier);
  const adapter = adapterFactory.get(transformer);
  const result = (await adapter.fromDoc(doc)) as AdapterResult;

  if (
    !result ||
    (!result.file && !result.assetsIds.length && !frameAssets.length)
  ) {
    return;
  }

  const assetsIds = [
    ...new Set([...result.assetsIds, ...frameAssets.map(asset => asset.id)]),
  ];

  const docTitle = doc.meta?.title || 'Untitled';
  const contentBlob = new Blob([result.file], { type: 'text/html' });
  const indexFileName = `${docTitle}.html`;

  let downloadBlob: Blob;
  let name: string;

  if (assetsIds.length > 0) {
    const zip = await createAssetsArchive(transformer.assets, assetsIds);
    await zip.file(indexFileName, contentBlob);
    downloadBlob = await zip.generate();
    name = `${docTitle}.zip`;
  } else {
    downloadBlob = contentBlob;
    name = `${docTitle}.html`;
  }

  download(downloadBlob, name);
}

async function exportToHtml(doc: Store, std?: BlockStdScope) {
  if (!std) {
    // If std is not provided, we use the default export method
    await HtmlTransformer.exportDoc(doc);
  } else {
    await exportHtmlWithFrames(doc, std);
  }
}

async function exportToMarkdown(doc: Store, std?: BlockStdScope) {
  if (!std) {
    // If std is not provided, we use the default export method
    await MarkdownTransformer.exportDoc(doc);
  } else {
    await exportMarkdownWithFrames(doc, std);
  }
}

async function exportHandler({
  page,
  type,
  editorContainer,
}: ExportHandlerOptions) {
  const editorRoot = document.querySelector('editor-host');
  track.$.sharePanel.$.export({
    type,
  });
  switch (type) {
    case 'html':
      await exportToHtml(page, editorRoot?.std);
      return;
    case 'markdown':
      await exportToMarkdown(page, editorRoot?.std);
      return;
    case 'snapshot':
      await ZipTransformer.exportDocs(
        page.workspace,
        getAFFiNEWorkspaceSchema(),
        [page]
      );
      return;
    case 'pdf':
      await printToPdf(editorContainer);
      return;
    case 'png': {
      await editorRoot?.std.get(ExportManager).exportPng();
      return;
    }
    case 'pdf-export': {
      await PdfTransformer.exportDoc(page);
      return;
    }
  }
}

export const useExportPage = () => {
  const editor = useService(EditorService).editor;
  const editorContainer = useLiveData(editor.editorContainer$);
  const blocksuiteDoc = editor.doc.blockSuiteDoc;
  const pushGlobalLoadingEvent = useSetAtom(pushGlobalLoadingEventAtom);
  const resolveGlobalLoadingEvent = useSetAtom(resolveGlobalLoadingEventAtom);
  const t = useI18n();

  const onClickHandler = useAsyncCallback(
    async (type: ExportType) => {
      if (editorContainer === null) return;

      // editor container is wrapped by a proxy, we need to get the origin
      const originEditorContainer = (editorContainer as any)
        .origin as AffineEditorContainer;

      const globalLoadingID = nanoid();
      pushGlobalLoadingEvent({
        key: globalLoadingID,
      });
      try {
        await exportHandler({
          page: blocksuiteDoc,
          type,
          editorContainer: originEditorContainer,
        });
        notify.success({
          title: t['com.affine.export.success.title'](),
          message: t['com.affine.export.success.message'](),
        });
      } catch (err) {
        console.error(err);
        notify.error({
          title: t['com.affine.export.error.title'](),
          message: t['com.affine.export.error.message'](),
        });
      } finally {
        resolveGlobalLoadingEvent(globalLoadingID);
      }
    },
    [
      blocksuiteDoc,
      editorContainer,
      pushGlobalLoadingEvent,
      resolveGlobalLoadingEvent,
      t,
    ]
  );

  return onClickHandler;
};
