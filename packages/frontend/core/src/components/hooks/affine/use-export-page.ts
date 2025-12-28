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
import { ExportManager } from '@blocksuite/affine/blocks/surface';
import {
  docLinkBaseURLMiddleware,
  embedSyncedDocMiddleware,
  HtmlAdapterFactoryIdentifier,
  MarkdownAdapterFactoryIdentifier,
  titleMiddleware,
} from '@blocksuite/affine/shared/adapters';
import { printToPdf } from '@blocksuite/affine/shared/utils';
import type { BlockStdScope } from '@blocksuite/affine/std';
import { type Store, Transformer } from '@blocksuite/affine/store';
import {
  createAssetsArchive,
  download,
  HtmlTransformer,
  MarkdownTransformer,
  PdfTransformer,
  ZipTransformer,
} from '@blocksuite/affine/widgets/linked-doc';
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

type AdapterFactoryIdentifier =
  | typeof HtmlAdapterFactoryIdentifier
  | typeof MarkdownAdapterFactoryIdentifier;

interface AdapterConfig {
  identifier: AdapterFactoryIdentifier;
  fileExtension: string; // file extension need to be lower case with dot prefix, e.g. '.md', '.txt', '.html'
  contentType: string;
  indexFileName: string;
}

async function exportDoc(
  doc: Store,
  std: BlockStdScope,
  config: AdapterConfig
) {
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

  const adapterFactory = std.store.provider.get(config.identifier);
  const adapter = adapterFactory.get(transformer);
  const result = (await adapter.fromDoc(doc)) as AdapterResult;

  if (!result || (!result.file && !result.assetsIds.length)) {
    return;
  }

  const docTitle = doc.meta?.title || 'Untitled';
  const contentBlob = new Blob([result.file], { type: config.contentType });

  let downloadBlob: Blob;
  let name: string;

  if (result.assetsIds.length > 0) {
    if (!transformer.assets) {
      throw new Error('No assets found');
    }
    const zip = await createAssetsArchive(transformer.assets, result.assetsIds);
    await zip.file(config.indexFileName, contentBlob);
    downloadBlob = await zip.generate();
    name = `${docTitle}.zip`;
  } else {
    downloadBlob = contentBlob;
    name = `${docTitle}${config.fileExtension}`;
  }

  download(downloadBlob, name);
}

async function exportToHtml(doc: Store, std?: BlockStdScope) {
  if (!std) {
    // If std is not provided, we use the default export method
    await HtmlTransformer.exportDoc(doc);
  } else {
    await exportDoc(doc, std, {
      identifier: HtmlAdapterFactoryIdentifier,
      fileExtension: '.html',
      contentType: 'text/html',
      indexFileName: 'index.html',
    });
  }
}

async function exportToMarkdown(doc: Store, std?: BlockStdScope) {
  if (!std) {
    // If std is not provided, we use the default export method
    await MarkdownTransformer.exportDoc(doc);
  } else {
    await exportDoc(doc, std, {
      identifier: MarkdownAdapterFactoryIdentifier,
      fileExtension: '.md',
      contentType: 'text/plain',
      indexFileName: 'index.md',
    });
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
