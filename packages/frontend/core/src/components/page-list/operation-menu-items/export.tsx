import { MenuIcon, MenuItem, MenuSub } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  ExportIcon,
  ExportToHtmlIcon,
  ExportToMarkdownIcon,
  ExportToPdfIcon,
  ExportToPngIcon,
} from '@blocksuite/icons';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

import { transitionStyle } from './index.css';

interface ExportMenuItemProps<T> {
  onSelect: () => void;
  className?: string;
  type: T;
  icon: ReactNode;
  label: string;
}

interface ExportProps {
  exportHandler: (type: 'pdf' | 'html' | 'png' | 'markdown') => Promise<void>;
  pageMode?: 'page' | 'edgeless';
  className?: string;
}

export function ExportMenuItem<T>({
  onSelect,
  className,
  type,
  icon,
  label,
}: ExportMenuItemProps<T>) {
  return (
    <MenuItem
      className={className}
      data-testid={`export-to-${type}`}
      onSelect={onSelect}
      block
      preFix={<MenuIcon>{icon}</MenuIcon>}
    >
      {label}
    </MenuItem>
  );
}

export const ExportMenuItems = ({
  exportHandler,
  className = transitionStyle,
  pageMode = 'page',
}: ExportProps) => {
  const t = useAFFiNEI18N();
  const itemMap = useMemo(
    () => [
      {
        component: ExportMenuItem,
        props: {
          onSelect: () => exportHandler('pdf'),
          className: className,
          type: 'pdf',
          icon: <ExportToPdfIcon />,
          label: t['Export to PDF'](),
        },
      },
      {
        component: ExportMenuItem,
        props: {
          onSelect: () => exportHandler('html'),
          className: className,
          type: 'html',
          icon: <ExportToHtmlIcon />,
          label: t['Export to HTML'](),
        },
      },
      {
        component: ExportMenuItem,
        props: {
          onSelect: () => exportHandler('png'),
          className: className,
          type: 'png',
          icon: <ExportToPngIcon />,
          label: t['Export to PNG'](),
        },
      },
      {
        component: ExportMenuItem,
        props: {
          onSelect: () => exportHandler('markdown'),
          className: className,
          type: 'markdown',
          icon: <ExportToMarkdownIcon />,
          label: t['Export to Markdown'](),
        },
      },
    ],
    [className, exportHandler, t]
  );
  const items = itemMap.map(({ component: Component, props }) =>
    pageMode === 'edgeless' &&
    (props.type === 'pdf' || props.type === 'png') ? null : (
      <Component key={props.label} {...props} />
    )
  );
  return items;
};

export const Export = ({ exportHandler, className, pageMode }: ExportProps) => {
  const t = useAFFiNEI18N();
  const items = (
    <ExportMenuItems
      exportHandler={exportHandler}
      className={className}
      pageMode={pageMode}
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
