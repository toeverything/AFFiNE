import { getEnvironment } from '@affine/env/config';
import {
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
  SidebarIcon,
} from '@blocksuite/icons';
import { useAtom } from 'jotai';

import { IconButton } from '../../..';
import type { History } from '..';
import { navHeaderStyle, sidebarButtonStyle } from '../index.css';
import { appSidebarOpenAtom } from '../index.jotai';

export type SidebarHeaderProps = {
  router?: {
    back: () => unknown;
    forward: () => unknown;
    history: History;
  };
};

export const SidebarHeader = (props: SidebarHeaderProps) => {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  const environment = getEnvironment();
  return (
    <div className={navHeaderStyle} data-open={open}>
      {environment.isDesktop && (
        <>
          {environment.isMacOs && <div style={{ flex: 1 }} />}
          <IconButton
            size="middle"
            data-testid="app-sidebar-arrow-button-back"
            disabled={props.router?.history.current === 0}
            onClick={() => {
              props.router?.back();
            }}
          >
            <ArrowLeftSmallIcon />
          </IconButton>
          <IconButton
            size="middle"
            data-testid="app-sidebar-arrow-button-forward"
            disabled={
              props.router
                ? props.router.history.stack.length > 0 &&
                  props.router.history.current ===
                    props.router.history.stack.length - 1
                : false
            }
            onClick={() => {
              props.router?.forward();
            }}
          >
            <ArrowRightSmallIcon />
          </IconButton>

          {!environment.isMacOs && <div style={{ flex: 1 }} />}
        </>
      )}
      <IconButton
        data-testid="app-sidebar-arrow-button-collapse"
        className={sidebarButtonStyle}
        onClick={() => setOpen(open => !open)}
      >
        <SidebarIcon width={24} height={24} />
      </IconButton>
    </div>
  );
};
