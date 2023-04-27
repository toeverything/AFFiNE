import { SidebarIcon } from '@blocksuite/icons';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { useAtom, useAtomValue } from 'jotai';
import type { PropsWithChildren, ReactElement } from 'react';
import type { ReactNode } from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import { IconButton } from '../../ui/button/IconButton';
import {
  navBodyStyle,
  navFooterStyle,
  navHeaderStyle,
  navStyle,
  navWidthVar,
  sidebarButtonStyle,
} from './index.css';
import { appSidebarOpenAtom, appSidebarWidthAtom } from './index.jotai';

export { appSidebarOpenAtom };

export type AppSidebarProps = PropsWithChildren<{
  footer?: ReactNode | undefined;
}>;

export const AppSidebar = forwardRef<HTMLElement, AppSidebarProps>(
  function AppSidebar(props, forwardedRef): ReactElement {
    const ref = useRef<HTMLElement>(null);
    const [open, setOpen] = useAtom(appSidebarOpenAtom);

    useEffect(() => {
      if (open === undefined && ref.current) {
        const initialOpen =
          window.getComputedStyle(ref.current).position === 'relative';

        setOpen(initialOpen);
      }
    }, [open, setOpen]);

    const appSidebarWidth = useAtomValue(appSidebarWidthAtom);

    const handleSidebarOpen = useCallback(() => {
      setOpen(open => !open);
    }, [setOpen]);

    useImperativeHandle(forwardedRef, () => ref.current as HTMLElement);

    return (
      <nav
        className={navStyle}
        ref={ref}
        style={assignInlineVars({
          [navWidthVar]: `${appSidebarWidth}px`,
        })}
        data-testid="app-sidebar"
        data-open={open}
      >
        <div className={navHeaderStyle}>
          <IconButton
            className={sidebarButtonStyle}
            onClick={handleSidebarOpen}
          >
            <SidebarIcon width={24} height={24} />
          </IconButton>
        </div>
        <div className={navBodyStyle}>{props.children}</div>
        <div className={navFooterStyle}>{props.footer}</div>
      </nav>
    );
  }
);

export type { ResizeIndicatorProps } from './resize-indicator';
export { ResizeIndicator } from './resize-indicator';
