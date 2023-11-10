import {
  pushGlobalLoadingEventAtom,
  resolveGlobalLoadingEventAtom,
} from '@affine/component/global-loading';
import { pushNotificationAtom } from '@affine/component/notification-center';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { PageBlockModel } from '@blocksuite/blocks';
import { ContentParser } from '@blocksuite/blocks/content-parser';
import type { Page } from '@blocksuite/store';
import { useSetAtom } from 'jotai';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';

type ExportType = 'pdf' | 'html' | 'png' | 'markdown';
const typeToContentParserMethodMap = {
  pdf: 'exportPdf',
  html: 'exportHtml',
  png: 'exportPng',
  markdown: 'exportMarkdown',
} satisfies Record<ExportType, keyof ContentParser>;

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
  if (type === 'pdf' && environment.isDesktop && page.meta.mode === 'page') {
    await window.apis?.export.savePDFFileAs(
      (page.root as PageBlockModel).title.toString()
    );
  } else {
    const contentParser = getContentParser(page);
    const method = typeToContentParserMethodMap[type];
    await contentParser[method]();
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
