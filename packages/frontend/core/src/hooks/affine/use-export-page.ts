import {
  pushGlobalLoadingEventAtom,
  resolveGlobalLoadingEventAtom,
} from '@affine/component/global-loading';
import { pushNotificationAtom } from '@affine/component/notification-center';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  HtmlTransformer,
  MarkdownTransformer,
  type PageBlockModel,
} from '@blocksuite/blocks';
import { ContentParser } from '@blocksuite/blocks/content-parser';
import type { Page } from '@blocksuite/store';
import { useSetAtom } from 'jotai';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';

type ExportType = 'pdf' | 'html' | 'png' | 'markdown';

const contentParserWeakMap = new WeakMap<Page, ContentParser>();

const getContentParser = (page: Page) => {
  if (!contentParserWeakMap.has(page)) {
    contentParserWeakMap.set(
      page,
      new ContentParser(page, {
        imageProxyEndpoint: !environment.isDesktop
          ? runtimeConfig.imageProxyUrl
          : undefined,
      })
    );
  }
  return contentParserWeakMap.get(page) as ContentParser;
};

interface ExportHandlerOptions {
  page: Page;
  type: ExportType;
}

async function exportHandler({ page, type }: ExportHandlerOptions) {
  const contentParser = getContentParser(page);
  switch (type) {
    case 'html':
      await HtmlTransformer.exportPage(page);
      break;
    case 'markdown':
      await MarkdownTransformer.exportPage(page);
      break;
    case 'pdf':
      if (environment.isDesktop && page.meta.mode === 'page') {
        await window.apis?.export.savePDFFileAs(
          (page.root as PageBlockModel).title.toString()
        );
      } else {
        await contentParser['exportPdf']();
      }
      break;
    case 'png':
      await contentParser['exportPng']();
      break;
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
