import { pushNotificationAtom } from '@affine/component/notification-center';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { PageBlockModel } from '@blocksuite/blocks';
import {
  ArrowRightSmallIcon,
  ExportIcon,
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
  ExportToPdfIcon,
  ExportToPngIcon,
} from '@blocksuite/icons';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { Menu, MenuItem } from '../../..';
import { getContentParser } from './get-content-parser';
import type { CommonMenuItemProps } from './types';

const MenuItemStyle = {
  padding: '4px 12px',
};

export const ExportToPdfMenuItem = ({
  onSelect,
}: CommonMenuItemProps<{ type: 'pdf' }>) => {
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
          onSelect?.({ type: 'pdf' });
          setPushNotification({
            title: t['com.affine.export.success.title'](),
            message: t['com.affine.export.success.message'](),
            type: 'success',
          });
        })
        .catch(err => {
          console.error(err);
          setPushNotification({
            title: t['com.affine.export.error.title'](),
            message: t['com.affine.export.error.message'](),
            type: 'error',
          });
        });
    } else {
      const contentParser = getContentParser(currentEditor.page);

      contentParser
        .exportPdf()
        .then(() => {
          onSelect?.({ type: 'pdf' });
          setPushNotification({
            title: t['com.affine.export.success.title'](),
            message: t['com.affine.export.success.message'](),
            type: 'success',
          });
        })
        .catch(err => {
          console.error(err);
          setPushNotification({
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
      style={MenuItemStyle}
    >
      {t['Export to PDF']()}
    </MenuItem>
  );
};

export const ExportToHtmlMenuItem = ({
  onSelect,
}: CommonMenuItemProps<{ type: 'html' }>) => {
  const t = useAFFiNEI18N();
  const { currentEditor } = globalThis;
  const setPushNotification = useSetAtom(pushNotificationAtom);
  const onClickExportHtml = useCallback(() => {
    if (!currentEditor) {
      return;
    }
    const contentParser = getContentParser(currentEditor.page);
    contentParser
      .exportHtml()
      .then(() => {
        onSelect?.({ type: 'html' });
        setPushNotification({
          title: t['com.affine.export.success.title'](),
          message: t['com.affine.export.success.message'](),
          type: 'success',
        });
      })
      .catch(err => {
        console.error(err);
        setPushNotification({
          title: t['com.affine.export.error.title'](),
          message: t['com.affine.export.error.message'](),
          type: 'error',
        });
      });
    onSelect?.({ type: 'html' });
  }, [currentEditor, onSelect, setPushNotification, t]);
  return (
    <>
      <MenuItem
        data-testid="export-to-html"
        onClick={onClickExportHtml}
        icon={<ExportToHtmlIcon />}
        style={MenuItemStyle}
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
  const { currentEditor } = globalThis;
  const setPushNotification = useSetAtom(pushNotificationAtom);

  const onClickDownloadPNG = useCallback(() => {
    if (!currentEditor) {
      return;
    }
    const contentParser = getContentParser(currentEditor.page);

    contentParser
      .exportPng()
      .then(() => {
        onSelect?.({ type: 'png' });
        setPushNotification({
          title: t['com.affine.export.success.title'](),
          message: t['com.affine.export.success.message'](),
          type: 'success',
        });
      })
      .catch(err => {
        console.error(err);
        setPushNotification({
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
        style={MenuItemStyle}
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
  const { currentEditor } = globalThis;
  const setPushNotification = useSetAtom(pushNotificationAtom);
  const onClickExportMarkdown = useCallback(() => {
    if (!currentEditor) {
      return;
    }
    const contentParser = getContentParser(currentEditor.page);
    contentParser
      .exportMarkdown()
      .then(() => {
        onSelect?.({ type: 'markdown' });
        setPushNotification({
          title: t['com.affine.export.success.title'](),
          message: t['com.affine.export.success.message'](),
          type: 'success',
        });
      })
      .catch(err => {
        console.error(err);
        setPushNotification({
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
        style={MenuItemStyle}
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
      trigger="click"
      placement="right-start"
      content={
        <>
          <ExportToPdfMenuItem></ExportToPdfMenuItem>
          <ExportToHtmlMenuItem></ExportToHtmlMenuItem>
          <ExportToPngMenuItem></ExportToPngMenuItem>
          <ExportToMarkdownMenuItem></ExportToMarkdownMenuItem>
        </>
      }
      menuStyles={{
        borderRadius: '8px',
        padding: '8px',
        background: 'var(--affine-background-overlay-panel-color)',
      }}
    >
      <MenuItem
        data-testid="export-menu"
        icon={<ExportIcon />}
        endIcon={<ArrowRightSmallIcon />}
        style={{ padding: '4px 12px' }}
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
