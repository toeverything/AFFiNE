import { pushNotificationAtom } from '@affine/component/notification-center';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { PageBlockModel } from '@blocksuite/blocks';
import {
  ExportIcon,
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
  ExportToPdfIcon,
  ExportToPngIcon,
} from '@blocksuite/icons';
import { MenuIcon, MenuItem, MenuSub } from '@toeverything/components/menu';
import { useSetAtom } from 'jotai';
import { useCallback, useRef } from 'react';

import { getContentParser } from './get-content-parser';
import { transitionStyle } from './index.css';
import type { CommonMenuItemProps } from './types';

export const ExportToPdfMenuItem = ({
  onSelect,
  className,
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
      className={className}
      data-testid="export-to-pdf"
      onSelect={onClickDownloadPDF}
      block
      preFix={
        <MenuIcon>
          <ExportToPdfIcon />
        </MenuIcon>
      }
    >
      {t['Export to PDF']()}
    </MenuItem>
  );
};

export const ExportToHtmlMenuItem = ({
  onSelect,
  className,
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
        className={className}
        data-testid="export-to-html"
        onSelect={onClickExportHtml}
        block
        preFix={
          <MenuIcon>
            <ExportToHtmlIcon />
          </MenuIcon>
        }
      >
        {t['Export to HTML']()}
      </MenuItem>
    </>
  );
};

export const ExportToPngMenuItem = ({
  onSelect,
  className,
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
        className={className}
        data-testid="export-to-png"
        onSelect={onClickDownloadPNG}
        block
        preFix={
          <MenuIcon>
            <ExportToPngIcon />
          </MenuIcon>
        }
      >
        {t['Export to PNG']()}
      </MenuItem>
    </>
  );
};

export const ExportToMarkdownMenuItem = ({
  onSelect,
  className,
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
        className={className}
        data-testid="export-to-markdown"
        onSelect={onClickExportMarkdown}
        block
        preFix={
          <MenuIcon>
            <ExportToMarkdownIcon />
          </MenuIcon>
        }
      >
        {t['Export to Markdown']()}
      </MenuItem>
    </>
  );
};

// fixme: refactor this file, export function may should be passed by 'props', this file is just a ui component
export const Export = () => {
  const ref = useRef(null);
  const t = useAFFiNEI18N();
  return (
    <div ref={ref}>
      <MenuSub
        items={
          <>
            <ExportToPdfMenuItem
              className={transitionStyle}
            ></ExportToPdfMenuItem>
            <ExportToHtmlMenuItem
              className={transitionStyle}
            ></ExportToHtmlMenuItem>
            <ExportToPngMenuItem
              className={transitionStyle}
            ></ExportToPngMenuItem>
            <ExportToMarkdownMenuItem
              className={transitionStyle}
            ></ExportToMarkdownMenuItem>
          </>
        }
        triggerOptions={{
          className: transitionStyle,
          preFix: (
            <MenuIcon>
              <ExportIcon />
            </MenuIcon>
          ),
          ['data-testid' as string]: 'export-menu',
        }}
        portalOptions={{
          container: ref.current,
        }}
      >
        {t.Export()}
      </MenuSub>
    </div>
  );
};
