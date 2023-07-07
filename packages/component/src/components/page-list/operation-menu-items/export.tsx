import { pushNotificationAtom } from '@affine/component/notification-center';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { PageBlockModel } from '@blocksuite/blocks';
import { ContentParser } from '@blocksuite/blocks/content-parser';
import {
  ArrowRightSmallIcon,
  ExportIcon,
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
  ExportToPdfIcon,
  ExportToPngIcon,
} from '@blocksuite/icons';
import { useSetAtom } from 'jotai';
import { useCallback, useRef } from 'react';

import { Menu, MenuItem } from '../../..';
import type { CommonMenuItemProps } from './types';

export const ExportToPdfMenuItem = ({
  onSelect,
}: CommonMenuItemProps<{ type: 'pdf' }>) => {
  const t = useAFFiNEI18N();
  const contentParserRef = useRef<ContentParser>();
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
          onSelect?.({ type: 'pdf' });
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
          onSelect?.({ type: 'pdf' });
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
  }, [currentEditor, onSelect, setPushNotification, t]);

  return (
    <MenuItem
      data-testid="export-to-pdf"
      onClick={onClickDownloadPDF}
      icon={<ExportToPdfIcon />}
    >
      {t['Export to PDF']()}
    </MenuItem>
  );
};

export const ExportToHtmlMenuItem = ({
  onSelect,
}: CommonMenuItemProps<{ type: 'html' }>) => {
  const t = useAFFiNEI18N();
  const contentParserRef = useRef<ContentParser>();
  const { currentEditor } = globalThis;
  const setPushNotification = useSetAtom(pushNotificationAtom);
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
        onSelect?.({ type: 'html' });
        setPushNotification({
          key: 'export-to-html',
          title: t['com.affine.export.success.title'](),
          message: t['com.affine.export.success.message'](),
          type: 'success',
        });
      })
      .catch(err => {
        console.error(err);
      });
    onSelect?.({ type: 'html' });
  }, [currentEditor, onSelect, setPushNotification, t]);
  return (
    <>
      <MenuItem
        data-testid="export-to-html"
        onClick={onClickExportHtml}
        icon={<ExportToHtmlIcon />}
      >
        {t['Export to HTML']()}
      </MenuItem>
    </>
  );
};

export const ExportToPngMenuItem = ({
  onSelect,
}: CommonMenuItemProps<{ type: 'png' }>) => {
  const t = useAFFiNEI18N();
  const contentParserRef = useRef<ContentParser>();
  const { currentEditor } = globalThis;
  const setPushNotification = useSetAtom(pushNotificationAtom);

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
        onSelect?.({ type: 'png' });
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
  }, [currentEditor, onSelect, setPushNotification, t]);

  return (
    <>
      <MenuItem
        data-testid="export-to-png"
        onClick={onClickDownloadPNG}
        icon={<ExportToPngIcon />}
      >
        {t['Export to PNG']()}
      </MenuItem>
    </>
  );
};

export const ExportToMarkdownMenuItem = ({
  onSelect,
}: CommonMenuItemProps<{ type: 'markdown' }>) => {
  const t = useAFFiNEI18N();
  const contentParserRef = useRef<ContentParser>();
  const { currentEditor } = globalThis;
  const setPushNotification = useSetAtom(pushNotificationAtom);
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
        onSelect?.({ type: 'markdown' });
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
    onSelect?.({ type: 'markdown' });
  }, [currentEditor, onSelect, setPushNotification, t]);
  return (
    <>
      <MenuItem
        data-testid="export-to-markdown"
        onClick={onClickExportMarkdown}
        icon={<ExportToMarkdownIcon />}
      >
        {t['Export to Markdown']()}
      </MenuItem>
    </>
  );
};

export const Export = ({
  onItemClick,
}: CommonMenuItemProps<{ type: 'markdown' | 'html' | 'pdf' | 'png' }>) => {
  const t = useAFFiNEI18N();
  return (
    <Menu
      width={248}
      placement="left"
      trigger="click"
      content={
        <>
          <ExportToPdfMenuItem></ExportToPdfMenuItem>
          <ExportToHtmlMenuItem></ExportToHtmlMenuItem>
          <ExportToPngMenuItem></ExportToPngMenuItem>
          <ExportToMarkdownMenuItem></ExportToMarkdownMenuItem>
        </>
      }
    >
      <MenuItem
        data-testid="export-menu"
        icon={<ExportIcon />}
        endIcon={<ArrowRightSmallIcon />}
        onClick={e => {
          e.stopPropagation();
          onItemClick?.();
        }}
      >
        {t.Export()}
      </MenuItem>
    </Menu>
  );
};
