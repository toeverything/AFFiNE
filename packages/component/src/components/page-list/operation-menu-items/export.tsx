import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  rootCurrentPageIdAtom,
  rootCurrentWorkspaceIdAtom,
} from '@affine/workspace/atom';
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
import { useAtomValue } from 'jotai';
import { useCallback, useRef } from 'react';

import { Menu, MenuItem } from '../../..';
import type { CommonMenuItemProps } from './types';

const ExportToPdfMenuItem = ({
  onSelect,
}: CommonMenuItemProps<{ type: 'pdf' }>) => {
  const t = useAFFiNEI18N();
  const contentParserRef = useRef<ContentParser>();
  const currentWorkspaceId = useAtomValue(rootCurrentWorkspaceIdAtom);
  const currentPageId = useAtomValue(rootCurrentPageIdAtom);
  const { currentEditor } = globalThis;
  const onClickDownloadPDF = useCallback(() => {
    if (!currentEditor) {
      return;
    }
    const contentParser =
      contentParserRef.current ??
      (contentParserRef.current = new ContentParser(currentEditor.page));

    window.apis?.export
      .savePDFFileAs(
        currentWorkspaceId || '',
        currentPageId || '',
        (currentEditor.page.root as PageBlockModel).title.toString(),
        currentEditor.mode
      )
      .then(result => {
        if (result !== undefined) {
          return;
        }
        return contentParser.exportPdf();
      })
      .then(() => {
        onSelect?.({ type: 'pdf' });
      })
      .catch(err => {
        console.error(err);
      });
  }, [currentEditor, onSelect, currentWorkspaceId, currentPageId]);
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

const ExportToHtmlMenuItem = ({
  onSelect,
}: CommonMenuItemProps<{ type: 'html' }>) => {
  const t = useAFFiNEI18N();
  const contentParserRef = useRef<ContentParser>();
  const { currentEditor } = globalThis;
  const onClickExportHtml = useCallback(() => {
    if (!currentEditor) {
      return;
    }
    if (!contentParserRef.current) {
      contentParserRef.current = new ContentParser(currentEditor.page);
    }
    contentParserRef.current.exportHtml().catch(err => {
      console.error(err);
    });
    onSelect?.({ type: 'html' });
  }, [onSelect, currentEditor]);
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

const ExportToPngMenuItem = ({
  onSelect,
}: CommonMenuItemProps<{ type: 'png' }>) => {
  const t = useAFFiNEI18N();
  const contentParserRef = useRef<ContentParser>();
  const { currentEditor } = globalThis;
  const currentWorkspaceId = useAtomValue(rootCurrentWorkspaceIdAtom);
  const currentPageId = useAtomValue(rootCurrentPageIdAtom);
  const onClickDownloadPNG = useCallback(() => {
    if (!currentEditor) {
      return;
    }
    const contentParser =
      contentParserRef.current ??
      (contentParserRef.current = new ContentParser(currentEditor.page));

    window.apis?.export
      .savePngFileAs(
        currentWorkspaceId || '',
        currentPageId || '',
        (currentEditor.page.root as PageBlockModel).title.toString(),
        currentEditor.mode
      )
      .then(result => {
        if (result !== undefined) {
          return;
        }
        return contentParser.exportPng();
      })
      .then(() => {
        onSelect?.({ type: 'png' });
      })
      .catch(err => {
        console.error(err);
      });
  }, [currentEditor, onSelect, currentWorkspaceId, currentPageId]);
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

const ExportToMarkdownMenuItem = ({
  onSelect,
}: CommonMenuItemProps<{ type: 'markdown' }>) => {
  const t = useAFFiNEI18N();
  const contentParserRef = useRef<ContentParser>();
  const { currentEditor } = globalThis;
  const onClickExportMarkdown = useCallback(() => {
    if (!currentEditor) {
      return;
    }
    if (!contentParserRef.current) {
      contentParserRef.current = new ContentParser(currentEditor.page);
    }
    contentParserRef.current.exportMarkdown().catch(err => {
      console.error(err);
    });
    onSelect?.({ type: 'markdown' });
  }, [onSelect, currentEditor]);
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
