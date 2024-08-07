import { notify } from '@affine/component';
import {
  pushGlobalLoadingEventAtom,
  resolveGlobalLoadingEventAtom,
} from '@affine/component/global-loading';
import { track } from '@affine/core/mixpanel';
import { apis } from '@affine/electron-api';
import { useI18n } from '@affine/i18n';
import type { PageRootService, RootBlockModel } from '@blocksuite/blocks';
import { HtmlTransformer, MarkdownTransformer } from '@blocksuite/blocks';
import type { Doc } from '@blocksuite/store';
import { useSetAtom } from 'jotai';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';

type ExportType = 'pdf' | 'html' | 'png' | 'markdown';

interface ExportHandlerOptions {
  page: Doc;
  type: ExportType;
}

async function exportHandler({ page, type }: ExportHandlerOptions) {
  const editorRoot = document.querySelector('editor-host');
  let pageService: PageRootService | null = null;
  if (editorRoot) {
    pageService = editorRoot.spec.getService<PageRootService>('affine:page');
  }
  track.$.sharePanel.$.export({
    type,
  });
  switch (type) {
    case 'html':
      await HtmlTransformer.exportDoc(page);
      break;
    case 'markdown':
      await MarkdownTransformer.exportDoc(page);
      break;
    case 'pdf':
      if (environment.isDesktop && page.meta?.mode === 'page') {
        await apis?.export.savePDFFileAs(
          (page.root as RootBlockModel).title.toString()
        );
      } else {
        if (!pageService) return;
        await pageService.exportManager.exportPdf();
      }
      break;
    case 'png': {
      if (!pageService) return;
      await pageService.exportManager.exportPng();
      break;
    }
  }
}

export const useExportPage = (page: Doc) => {
  const pushGlobalLoadingEvent = useSetAtom(pushGlobalLoadingEventAtom);
  const resolveGlobalLoadingEvent = useSetAtom(resolveGlobalLoadingEventAtom);
  const t = useI18n();

  const onClickHandler = useCallback(
    async (type: ExportType) => {
      const globalLoadingID = nanoid();
      pushGlobalLoadingEvent({
        key: globalLoadingID,
      });
      try {
        await exportHandler({
          page,
          type,
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
    [page, pushGlobalLoadingEvent, resolveGlobalLoadingEvent, t]
  );

  return onClickHandler;
};
