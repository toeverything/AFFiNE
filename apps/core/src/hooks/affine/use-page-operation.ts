import { pushNotificationAtom } from '@affine/component/notification-center';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { PageBlockModel } from '@blocksuite/blocks';
import { ContentParser } from '@blocksuite/blocks/content-parser';
import type { Page } from '@blocksuite/store';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

type ExportType = 'pdf' | 'html' | 'png' | 'markdown';
type ExportMethod = 'exportPdf' | 'exportHtml' | 'exportPng' | 'exportMarkdown';

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

export const useBlocksuitePageOperation = (page: Page) => {
  const pushNotification = useSetAtom(pushNotificationAtom);
  const t = useAFFiNEI18N();

  const onClickHandler = useCallback(
    (exportMethod: ExportMethod, type: ExportType) => () => {
      const contentParser = getContentParser(page);
      const exportHandler = async ({
        exportMethod,
        type,
        contentParser,
        onSelect,
      }: {
        exportMethod: ExportMethod;
        type: ExportType;
        contentParser: ContentParser;
        onSelect?: ({ type }: { type: ExportType }) => void;
      }) => {
        await contentParser[exportMethod]()
          .then(() => {
            onSelect?.({ type });
            pushNotification({
              title: t['com.affine.export.success.title'](),
              message: t['com.affine.export.success.message'](),
              type: 'success',
            });
          })
          .catch(err => {
            console.error(err);
            pushNotification({
              title: t['com.affine.export.error.title'](),
              message: t['com.affine.export.error.message'](),
              type: 'error',
            });
          });
      };
      if (
        type === 'pdf' &&
        environment.isDesktop &&
        page.meta.mode === 'page'
      ) {
        window.apis?.export
          .savePDFFileAs((page.root as PageBlockModel).title.toString())
          .then(() => {
            pushNotification({
              title: t['com.affine.export.success.title'](),
              message: t['com.affine.export.success.message'](),
              type: 'success',
            });
          })
          .catch(err => {
            console.error(err);
            pushNotification({
              title: t['com.affine.export.error.title'](),
              message: t['com.affine.export.error.message'](),
              type: 'error',
            });
          });
      } else {
        exportHandler({
          exportMethod,
          type,
          contentParser,
        });
      }
    },
    [page, pushNotification, t]
  );

  return {
    onClickExportPDF: onClickHandler('exportPdf', 'pdf'),
    onClickExportHtml: onClickHandler('exportHtml', 'html'),
    onClickExportPNG: onClickHandler('exportPng', 'png'),
    onClickExportMarkdown: onClickHandler('exportMarkdown', 'markdown'),
  };
};
