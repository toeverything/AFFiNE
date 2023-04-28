import { getEnvironment } from '@affine/env';
import {
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
  SidebarIcon,
} from '@blocksuite/icons';
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
  sidebarFloatMaskStyle,
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

    const appSidebarWidth = useAtomValue(appSidebarWidthAtom);
    const initialRender = open === undefined;

    const handleSidebarOpen = useCallback(() => {
      setOpen(open => !open);
    }, [setOpen]);

    useImperativeHandle(forwardedRef, () => ref.current as HTMLElement);

    useEffect(() => {
      if (open === undefined && ref.current) {
        const initialOpen =
          window.getComputedStyle(ref.current).position === 'relative';

        setOpen(initialOpen);
      }
    }, [open, setOpen]);

    const environment = getEnvironment();
    const isMacosDesktop = environment.isDesktop && environment.isMacOs;
    if (initialRender) {
      return <div />;
    }
    return (
      <>
        <nav
          className={navStyle}
          ref={ref}
          style={assignInlineVars({
            [navWidthVar]: `${appSidebarWidth}px`,
          })}
          data-testid="app-sidebar"
          data-open={open}
          data-is-macos-electron={isMacosDesktop}
        >
          <div
            className={navHeaderStyle}
            data-is-macos-electron={isMacosDesktop}
            data-open={open}
          >
            {isMacosDesktop && (
              <>
                <IconButton
                  size="middle"
                  onClick={() => {
                    window.history.back();
                  }}
                >
                  <ArrowLeftSmallIcon />
                </IconButton>
                <IconButton
                  size="middle"
                  onClick={() => {
                    window.history.forward();
                  }}
                  style={{ marginLeft: '32px' }}
                >
                  <ArrowRightSmallIcon />
                </IconButton>
              </>
            )}
            <IconButton
              data-testid="app-sidebar-arrow-button-collapse"
              className={sidebarButtonStyle}
              onClick={handleSidebarOpen}
            >
              <SidebarIcon width={24} height={24} />
            </IconButton>
          </div>
          <div className={navBodyStyle}>{props.children}</div>
          <div className={navFooterStyle}>{props.footer}</div>
        </nav>
        <div
          data-testid="app-sidebar-float-mask"
          data-open={open}
          className={sidebarFloatMaskStyle}
          onClick={() => setOpen(false)}
        />
      </>
    );
  }
);

export type { ResizeIndicatorProps } from './resize-indicator';
export { ResizeIndicator } from './resize-indicator';
