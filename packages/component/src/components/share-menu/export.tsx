import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { PageBlockModel } from '@blocksuite/blocks';
import { ContentParser } from '@blocksuite/blocks/content-parser';
import {
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
  ExportToPdfIcon,
  ExportToPngIcon,
} from '@blocksuite/icons';
import { useSetAtom } from 'jotai';
import type { FC } from 'react';
import { useCallback, useRef } from 'react';

import { Button } from '../..';
import { pushNotificationAtom } from '../notification-center';
import {
  actionsStyle,
  descriptionStyle,
  exportButtonStyle,
  menuItemStyle,
  svgStyle,
} from './index.css';
import type { ShareMenuProps } from './share-menu';

export const Export: FC<ShareMenuProps> = () => {
  const contentParserRef = useRef<ContentParser>();
  const t = useAFFiNEI18N();
  const { currentEditor } = globalThis;
  const setPushNotification = useSetAtom(pushNotificationAtom);

  const onClickDownloadPDF = useCallback(() => {
    if (!currentEditor) {
      return;
    }

    if (environment.isDesktop && currentEditor.mode === 'page') {
      window.apis?.export
        .savePDFFileAs(
          (currentEditor.page.root as PageBlockModel).title.toString()
        )
        .then(() => {
          setPushNotification({
            key: 'export-to-pdf',
            title: t['com.affine.export.success.title'](),
            message: t['com.affine.export.success.message'](),
            type: 'success',
          });
        })
        .catch(err => {
          console.error(err);
          setPushNotification({
            key: 'export-to-pdf',
            title: t['com.affine.export.error.title'](),
            message: t['com.affine.export.error.message'](),
            type: 'error',
          });
        });
    } else {
      const contentParser =
        contentParserRef.current ??
        (contentParserRef.current = new ContentParser(currentEditor.page));

      contentParser
        .exportPdf()
        .then(() => {
          setPushNotification({
            key: 'export-to-pdf',
            title: t['com.affine.export.success.title'](),
            message: t['com.affine.export.success.message'](),
            type: 'success',
          });
        })
        .catch(err => {
          console.error(err);
          setPushNotification({
            key: 'export-to-pdf',
            title: t['com.affine.export.error.title'](),
            message: t['com.affine.export.error.message'](),
            type: 'error',
          });
        });
    }
  }, [currentEditor, setPushNotification, t]);
  const onClickExportHtml = useCallback(() => {
    if (!currentEditor) {
      return;
    }
    if (!contentParserRef.current) {
      contentParserRef.current = new ContentParser(currentEditor.page);
    }
    contentParserRef.current
      .exportHtml()
      .then(() => {
        setPushNotification({
          key: 'export-to-html',
          title: t['com.affine.export.success.title'](),
          message: t['com.affine.export.success.message'](),
          type: 'success',
        });
      })
      .catch(err => {
        console.error(err);
        setPushNotification({
          key: 'export-to-html',
          title: t['com.affine.export.error.title'](),
          message: t['com.affine.export.error.message'](),
          type: 'error',
        });
      });
  }, [currentEditor, setPushNotification, t]);
  const onClickDownloadPNG = useCallback(() => {
    if (!currentEditor) {
      return;
    }
    const contentParser =
      contentParserRef.current ??
      (contentParserRef.current = new ContentParser(currentEditor.page));

    contentParser
      .exportPng()
      .then(() => {
        setPushNotification({
          key: 'export-to-png',
          title: t['com.affine.export.success.title'](),
          message: t['com.affine.export.success.message'](),
          type: 'success',
        });
      })
      .catch(err => {
        console.error(err);
        setPushNotification({
          key: 'export-to-png',
          title: t['com.affine.export.error.title'](),
          message: t['com.affine.export.error.message'](),
          type: 'error',
        });
      });
  }, [currentEditor, setPushNotification, t]);
  const onClickExportMarkdown = useCallback(() => {
    if (!currentEditor) {
      return;
    }
    if (!contentParserRef.current) {
      contentParserRef.current = new ContentParser(currentEditor.page);
    }
    contentParserRef.current
      .exportMarkdown()
      .then(() => {
        setPushNotification({
          key: 'export-to-markdown',
          title: t['com.affine.export.success.title'](),
          message: t['com.affine.export.success.message'](),
          type: 'success',
        });
      })
      .catch(err => {
        console.error(err);
        setPushNotification({
          key: 'export-to-markdown',
          title: t['com.affine.export.error.title'](),
          message: t['com.affine.export.error.message'](),
          type: 'error',
        });
      });
  }, [currentEditor, setPushNotification, t]);
  return (
    <div className={menuItemStyle}>
      <div className={descriptionStyle}>
        {t['Export Shared Pages Description']()}
      </div>
      <div className={actionsStyle}>
        <Button className={exportButtonStyle} onClick={onClickDownloadPDF}>
          <ExportToPdfIcon className={svgStyle} />
          {t['Export to PDF']()}
        </Button>
        <Button className={exportButtonStyle} onClick={onClickExportHtml}>
          <ExportToHtmlIcon className={svgStyle} />
          {t['Export to HTML']()}
        </Button>
        <Button className={exportButtonStyle} onClick={onClickDownloadPNG}>
          <ExportToPngIcon className={svgStyle} />
          {t['Export to PNG']()}
        </Button>
        <Button className={exportButtonStyle} onClick={onClickExportMarkdown}>
          <ExportToMarkdownIcon className={svgStyle} />
          {t['Export to Markdown']()}
        </Button>
      </div>
    </div>
  );
};
