import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { PageBlockModel } from '@blocksuite/blocks';
import { ContentParser } from '@blocksuite/blocks/content-parser';
import {
  ArrowRightSmallIcon,
  ExportIcon,
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
  ExportToPdfIcon,
} from '@blocksuite/icons';
import { useRef } from 'react';

import { Menu, MenuItem } from '../../..';
import type { CommonMenuItemProps } from './types';

const ExportToPdfMenuItem = ({
  onSelect,
}: CommonMenuItemProps<{ type: 'pdf' }>) => {
  const t = useAFFiNEI18N();
  const contentParserRef = useRef<ContentParser>();
  return (
    <>
      {globalThis.currentEditor!.mode === 'page' && (
        <MenuItem
          data-testid="export-to-pdf"
          onClick={async () => {
            if (!contentParserRef.current) {
              contentParserRef.current = new ContentParser(
                globalThis.currentEditor!.page
              );
            }
            const result = await window.apis?.export.savePDFFileAs(
              (
                globalThis.currentEditor!.page.root as PageBlockModel
              ).title.toString()
            );
            if (result !== undefined) {
              return;
            }
            contentParserRef.current.exportPdf();
            onSelect?.({ type: 'pdf' });
          }}
          icon={<ExportToPdfIcon />}
        >
          {t['Export to PDF']()}
        </MenuItem>
      )}
    </>
  );
};

const ExportToHtmlMenuItem = ({
  onSelect,
}: CommonMenuItemProps<{ type: 'html' }>) => {
  const t = useAFFiNEI18N();
  const contentParserRef = useRef<ContentParser>();
  return (
    <>
      <MenuItem
        data-testid="export-to-html"
        onClick={() => {
          if (!contentParserRef.current) {
            contentParserRef.current = new ContentParser(
              globalThis.currentEditor!.page
            );
          }
          contentParserRef.current.exportHtml();
          onSelect?.({ type: 'html' });
        }}
        icon={<ExportToHtmlIcon />}
      >
        {t['Export to HTML']()}
      </MenuItem>
    </>
  );
};

// const ExportToPngMenuItem = ({
//   onSelect,
// }: CommonMenuItemProps<{ type: 'png' }>) => {
//   const t = useAFFiNEI18N();
//   const contentParserRef = useRef<ContentParser>();
//   return (
//     <>
//       {globalThis.currentEditor!.mode === 'page' && (
//         <MenuItem
//           data-testid="export-to-png"
//           onClick={() => {
//             if (!contentParserRef.current) {
//               contentParserRef.current = new ContentParser(
//                 globalThis.currentEditor!.page
//               );
//             }
//             contentParserRef.current.exportPng();
//             onSelect?.({ type: 'png' });
//           }}
//           icon={<ExportToPngIcon />}
//         >
//           {t['Export to PNG']()}
//         </MenuItem>
//       )}
//     </>
//   );
// };

const ExportToMarkdownMenuItem = ({
  onSelect,
}: CommonMenuItemProps<{ type: 'markdown' }>) => {
  const t = useAFFiNEI18N();
  const contentParserRef = useRef<ContentParser>();
  return (
    <>
      <MenuItem
        data-testid="export-to-markdown"
        onClick={() => {
          if (!contentParserRef.current) {
            contentParserRef.current = new ContentParser(
              globalThis.currentEditor!.page
            );
          }
          contentParserRef.current.exportMarkdown();
          onSelect?.({ type: 'markdown' });
        }}
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
          {/* <ExportToPngMenuItem></ExportToPngMenuItem> */}
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
