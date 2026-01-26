import { notify } from '@affine/component';
import {
  pushGlobalLoadingEventAtom,
  resolveGlobalLoadingEventAtom,
} from '@affine/component/global-loading';
import type { AffineEditorContainer } from '@affine/core/blocksuite/block-suite-editor/blocksuite-editor';
import { DesktopApiService } from '@affine/core/modules/desktop-api';
import { EditorService } from '@affine/core/modules/editor';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
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
import {
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
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

type ExportResult = 'completed' | 'canceled';

interface ExportHandlerOptions {
  page: Store;
  editorContainer: AffineEditorContainer;
  type: ExportType;
  enablePdfmakeExport: boolean;
  desktopApiHandler?: DesktopApiService['handler'];
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

async function preparePrintFrameForPdfExport(
  rootElement: HTMLElement
): Promise<{
  cleanup: () => void;
}> {
  const iframeId = 'affine-export-pdf-frame';
  const iframe = document.createElement('iframe');
  iframe.id = iframeId;
  iframe.style.display = 'none';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.append(iframe);

  const style = document.createElement('style');
  style.dataset.affineExportPdf = 'true';
  style.textContent = `@media print {
    body > * {
      display: none !important;
    }
    body > #${iframeId} {
      display: block !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
    }
  }`;
  document.head.append(style);

  const canvasImgObjectUrlMap = new Map<string, string>();
  const allCanvas = rootElement.getElementsByTagName('canvas');

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;

    iframe.remove();
    style.remove();

    for (const canvas of allCanvas) {
      delete canvas.dataset['printToPdfCanvasKey'];
    }
    for (const url of canvasImgObjectUrlMap.values()) {
      URL.revokeObjectURL(url);
    }
  };

  try {
    await new Promise<void>((resolve, reject) => {
      iframe.onload = async () => {
        try {
          if (!iframe.contentWindow) {
            throw new Error('unable to prepare print iframe for pdf export');
          }

          iframe.contentWindow.document
            .write(`<!DOCTYPE html><html><head><style>
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              height: initial !important;
              overflow: initial !important;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
              background: white;
            }
            ::-webkit-scrollbar {
              display: none;
            }
            :root {
              --affine-note-shadow-box: none !important;
              --affine-note-shadow-sticker: none !important;
            }
          </style></head><body></body></html>`);

          const currentTheme =
            document.documentElement.getAttribute('data-theme');
          if (currentTheme) {
            iframe.contentWindow.document.documentElement.setAttribute(
              'data-theme',
              currentTheme
            );
          }

          // copy all styles to iframe
          for (const element of document.styleSheets) {
            try {
              for (const cssRule of element.cssRules) {
                const target = iframe.contentWindow.document.styleSheets[0];
                target.insertRule(cssRule.cssText, target.cssRules.length);
              }
            } catch {
              console.warn(
                '[export pdf] css cannot be applied when exporting pdf; skipping this stylesheet.',
                element.href ?? 'inline stylesheet'
              );
            }
          }

          // convert all canvas to image
          let canvasKey = 1;
          for (const canvas of allCanvas) {
            canvas.dataset['printToPdfCanvasKey'] = canvasKey.toString();
            canvasKey++;
            const canvasImgBlob = await new Promise<Blob | null>(resolve => {
              try {
                canvas.toBlob(resolve);
              } catch {
                resolve(null);
              }
            });
            if (!canvasImgBlob) {
              console.warn(
                '[export pdf] canvas cannot be converted to image when exporting pdf, this may be because of CORS policy'
              );
              continue;
            }
            canvasImgObjectUrlMap.set(
              canvas.dataset['printToPdfCanvasKey'],
              URL.createObjectURL(canvasImgBlob)
            );
          }

          const importedRoot = iframe.contentWindow.document.importNode(
            rootElement,
            true
          ) as HTMLDivElement;

          // draw saved canvas image to canvas
          const allImportedCanvas = importedRoot.getElementsByTagName('canvas');
          for (const importedCanvas of allImportedCanvas) {
            const importedCanvasKey =
              importedCanvas.dataset['printToPdfCanvasKey'];
            if (!importedCanvasKey) continue;

            const canvasImg = canvasImgObjectUrlMap.get(importedCanvasKey);
            const ctx = importedCanvas.getContext('2d');
            if (!canvasImg || !ctx) continue;

            const image = new Image();
            image.src = canvasImg;
            await image.decode();
            ctx.drawImage(image, 0, 0, ctx.canvas.width, ctx.canvas.height);
          }

          iframe.contentWindow.document.body.append(importedRoot);

          // wait a bit for fonts/assets
          await (iframe.contentWindow.document as any).fonts?.ready?.catch?.(
            () => undefined
          );
          await new Promise<void>(resolve => setTimeout(resolve, 300));

          resolve();
        } catch (e) {
          reject(e);
        }
      };
      iframe.srcdoc = '<!DOCTYPE html>';
    });
  } catch (e) {
    cleanup();
    throw e;
  }

  return { cleanup };
}

async function exportPdfUsingElectronPrintToPDF(
  page: Store,
  editorContainer: AffineEditorContainer,
  desktopApiHandler: DesktopApiService['handler']
): Promise<ExportResult> {
  const { cleanup } = await preparePrintFrameForPdfExport(editorContainer);
  try {
    const result = await desktopApiHandler.ui.exportToPdf({
      title: page.meta?.title,
    });
    return result?.canceled ? 'canceled' : 'completed';
  } finally {
    cleanup();
  }
}

async function exportHandler({
  page,
  type,
  editorContainer,
  enablePdfmakeExport,
  desktopApiHandler,
}: ExportHandlerOptions) {
  const editorRoot = document.querySelector('editor-host');
  track.$.sharePanel.$.export({
    type,
  });
  switch (type) {
    case 'html':
      await exportToHtml(page, editorRoot?.std);
      return 'completed';
    case 'markdown':
      await exportToMarkdown(page, editorRoot?.std);
      return 'completed';
    case 'snapshot':
      await ZipTransformer.exportDocs(
        page.workspace,
        getAFFiNEWorkspaceSchema(),
        [page]
      );
      return 'completed';
    case 'pdf':
      await printToPdf(editorContainer);
      return 'completed';
    case 'png': {
      await editorRoot?.std.get(ExportManager).exportPng();
      return 'completed';
    }
    case 'pdf-export': {
      if (enablePdfmakeExport) {
        await PdfTransformer.exportDoc(page);
        return 'completed';
      }

      if (BUILD_CONFIG.isElectron && desktopApiHandler) {
        return await exportPdfUsingElectronPrintToPDF(
          page,
          editorContainer,
          desktopApiHandler
        );
      }

      await printToPdf(editorContainer);
      return 'completed';
    }
  }
}

export const useExportPage = () => {
  const editor = useService(EditorService).editor;
  const featureFlags = useService(FeatureFlagService).flags;
  const desktopApi = useServiceOptional(DesktopApiService);
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
        const result = await exportHandler({
          page: blocksuiteDoc,
          type,
          editorContainer: originEditorContainer,
          enablePdfmakeExport: Boolean(
            featureFlags.enable_pdfmake_export.value
          ),
          desktopApiHandler: desktopApi?.handler,
        });
        if (result === 'completed') {
          notify.success({
            title: t['com.affine.export.success.title'](),
            message: t['com.affine.export.success.message'](),
          });
        }
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
      featureFlags,
      desktopApi,
      pushGlobalLoadingEvent,
      resolveGlobalLoadingEvent,
      t,
    ]
  );

  return onClickHandler;
};
