import { SidebarIcon } from '@blocksuite/icons';
import { useAtom } from 'jotai';
import type { PropsWithChildren, ReactElement } from 'react';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';

import { IconButton } from '../../ui/button/IconButton';
import {
  navBodyStyle,
  navFooterStyle,
  navHeaderStyle,
  navStyle,
  sidebarButtonStyle,
} from './index.css';
import { appSidebarOpenAtom } from './index.jotai';

export { appSidebarOpenAtom };

export type AppSidebarProps = PropsWithChildren<{
  footer?: ReactNode | undefined;
}>;

export const AppSidebar = (props: AppSidebarProps): ReactElement => {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useAtom(appSidebarOpenAtom);

  useEffect(() => {
    if (open === undefined && ref.current) {
      const initialOpen =
        window.getComputedStyle(ref.current).position === 'relative';

      setOpen(initialOpen);
    }
  }, [open, setOpen]);

  const handleSidebarOpen = useCallback(() => {
    setOpen(open => !open);
  }, [setOpen]);

  return (
    <nav className={navStyle} ref={ref} data-open={open}>
      <div className={navHeaderStyle}>
        <IconButton className={sidebarButtonStyle} onClick={handleSidebarOpen}>
          <SidebarIcon width={24} height={24} />
        </IconButton>
      </div>
      <div className={navBodyStyle}>{props.children}</div>
      <div className={navFooterStyle}>{props.footer}</div>
    </nav>
  );
};
