import {
  pushGlobalLoadingEventAtom,
  resolveGlobalLoadingEventAtom,
} from '@affine/component/global-loading';
import { pushNotificationAtom } from '@affine/component/notification-center';
import { apis } from '@affine/electron-api';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { PageService } from '@blocksuite/blocks';
import {
  HtmlTransformer,
  MarkdownTransformer,
  type PageBlockModel,
} from '@blocksuite/blocks';
import type { Page } from '@blocksuite/store';
import { useSetAtom } from 'jotai';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';

type ExportType = 'pdf' | 'html' | 'png' | 'markdown';

interface ExportHandlerOptions {
  page: Page;
  type: ExportType;
}

async function exportHandler({ page, type }: ExportHandlerOptions) {
  const editorRoot = document.querySelector('editor-host');
  let pageService: PageService | null = null;
  if (editorRoot) {
    pageService = editorRoot.spec.getService('affine:page') as PageService;
  }
  switch (type) {
    case 'html':
      await HtmlTransformer.exportPage(page);
      break;
    case 'markdown':
      await MarkdownTransformer.exportPage(page);
      break;
    case 'pdf':
      if (environment.isDesktop && page.meta.mode === 'page') {
        await apis?.export.savePDFFileAs(
          (page.root as PageBlockModel).title.toString()
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

export const useExportPage = (page: Page) => {
  const pushNotification = useSetAtom(pushNotificationAtom);
  const pushGlobalLoadingEvent = useSetAtom(pushGlobalLoadingEventAtom);
  const resolveGlobalLoadingEvent = useSetAtom(resolveGlobalLoadingEventAtom);
  const t = useAFFiNEI18N();

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
        pushNotification({
          title: t['com.affine.export.success.title'](),
          message: t['com.affine.export.success.message'](),
          type: 'success',
        });
      } catch (err) {
        console.error(err);
        pushNotification({
          title: t['com.affine.export.error.title'](),
          message: t['com.affine.export.error.message'](),
          type: 'error',
        });
      } finally {
        resolveGlobalLoadingEvent(globalLoadingID);
      }
    },
    [
      page,
      pushGlobalLoadingEvent,
      pushNotification,
      resolveGlobalLoadingEvent,
      t,
    ]
  );

  return onClickHandler;
};
