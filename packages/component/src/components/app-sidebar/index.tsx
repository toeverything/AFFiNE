import { SidebarIcon } from '@blocksuite/icons';
import type { PropsWithChildren, ReactElement } from 'react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import IconButton from '../../ui/button/IconButton';
import {
  navBodyStyle,
  navFooterStyle,
  navHeaderStyle,
  navStyle,
  sidebarButtonStyle,
} from './index.css';

export type AppSidebarProps = PropsWithChildren<{
  footer?: ReactNode | undefined;
}>;

export const AppSidebar = (props: AppSidebarProps): ReactElement => {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<boolean>(undefined!);
  const initialRender = open === undefined;

  useEffect(() => {
    if (open === undefined && ref.current) {
      const initialOpen =
        window.getComputedStyle(ref.current).position === 'relative';

      setOpen(initialOpen);
    }
  }, [open]);

  return (
    <nav className={navStyle} ref={ref}>
      <div className={navHeaderStyle}>
        <IconButton className={sidebarButtonStyle}>
          <SidebarIcon width={24} height={24} />
        </IconButton>
      </div>
      <div className={navBodyStyle}>{props.children}</div>
      <div className={navFooterStyle}>{props.footer}</div>
    </nav>
  );
};
