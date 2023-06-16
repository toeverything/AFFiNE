import { env } from '@affine/env/config';
import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons';
import { useAtomValue } from 'jotai';

import { IconButton } from '../../..';
import type { History } from '..';
import { navHeaderStyle } from '../index.css';
import { appSidebarOpenAtom } from '../index.jotai';
import { SidebarSwitch } from './sidebar-switch';

export type SidebarHeaderProps = {
  router?: {
    back: () => unknown;
    forward: () => unknown;
    history: History;
  };
};

export const SidebarHeader = (props: SidebarHeaderProps) => {
  const open = useAtomValue(appSidebarOpenAtom);
  return (
    <div className={navHeaderStyle} data-open={open}>
      {env.isDesktop && (
        <>
          {env.isMacOs && <div style={{ flex: 1 }} />}
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

          {!env.isMacOs && <div style={{ flex: 1 }} />}
        </>
      )}
      {open && <SidebarSwitch />}
    </div>
  );
};

export * from './sidebar-switch';
