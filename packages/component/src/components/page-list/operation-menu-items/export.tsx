import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ExportIcon,
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
  ExportToPdfIcon,
  ExportToPngIcon,
} from '@blocksuite/icons';
import { MenuIcon, MenuItem, MenuSub } from '@toeverything/components/menu';
import { type ReactNode, useCallback, useMemo } from 'react';

import { transitionStyle } from './index.css';

interface ExportMenuItemProps<T> {
  onSelect?: (type: T) => void;
  className?: string;
  type: T;
  icon: ReactNode;
  label: string;
}

interface ExportProps {
  exportPdf: () => void;
  exportHtml: () => void;
  exportPng: () => void;
  exportMarkdown: () => void;
  className?: string;
}

export const ExportMenuItem = <T,>({
  onSelect,
  className,
  type,
  icon,
  label,
}: ExportMenuItemProps<T>) => {
  const handleSelect = useCallback(() => {
    onSelect?.(type);
  }, [onSelect, type]);
  return (
    <MenuItem
      className={className}
      data-testid={`export-to-${type}`}
      onSelect={handleSelect}
      block
      preFix={<MenuIcon>{icon}</MenuIcon>}
    >
      {label}
    </MenuItem>
  );
};

export const ExportMenuItems = ({
  exportPdf,
  exportHtml,
  exportPng,
  exportMarkdown,
  className = transitionStyle,
}: ExportProps) => {
  const t = useAFFiNEI18N();
  const itemMap = useMemo(
    () => [
      {
        component: ExportMenuItem,
        props: {
          onSelect: exportPdf,
          className: className,
          type: 'pdf',
          icon: <ExportToPdfIcon />,
          label: t['Export to PDF'](),
        },
      },
      {
        component: ExportMenuItem,
        props: {
          onSelect: exportHtml,
          className: className,
          type: 'html',
          icon: <ExportToHtmlIcon />,
          label: t['Export to HTML'](),
        },
      },
      {
        component: ExportMenuItem,
        props: {
          onSelect: exportPng,
          className: className,
          type: 'png',
          icon: <ExportToPngIcon />,
          label: t['Export to PNG'](),
        },
      },
      {
        component: ExportMenuItem,
        props: {
          onSelect: exportMarkdown,
          className: className,
          type: 'markdown',
          icon: <ExportToMarkdownIcon />,
          label: t['Export to Markdown'](),
        },
      },
    ],
    [className, exportHtml, exportMarkdown, exportPdf, exportPng, t]
  );
  const items = itemMap.map(({ component: Component, props }) => (
    <Component key={props.label} {...props} />
  ));
  return <>{items}</>;
};

export const Export = ({
  exportPdf,
  exportHtml,
  exportPng,
  exportMarkdown,
  className,
}: ExportProps) => {
  const t = useAFFiNEI18N();
  const items = (
    <ExportMenuItems
      exportHtml={exportHtml}
      exportMarkdown={exportMarkdown}
      exportPdf={exportPdf}
      exportPng={exportPng}
      className={className}
    />
  );
  return (
    <MenuSub
      items={items}
      triggerOptions={{
        className: transitionStyle,
        preFix: (
          <MenuIcon>
            <ExportIcon />
          </MenuIcon>
        ),
        ['data-testid' as string]: 'export-menu',
      }}
    >
      {t.Export()}
    </MenuSub>
  );
};
