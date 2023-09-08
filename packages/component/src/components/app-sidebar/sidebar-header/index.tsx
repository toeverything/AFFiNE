import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { useAtomValue } from 'jotai';

import type { History } from '..';
import {
  navHeaderButton,
  navHeaderNavigationButtons,
  navHeaderStyle,
} from '../index.css';
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
    <div
      className={navHeaderStyle}
      data-open={open}
      data-is-macos-electron={environment.isDesktop && environment.isMacOs}
    >
      <SidebarSwitch show={open} />
      {environment.isDesktop && (
        <div className={navHeaderNavigationButtons}>
          <IconButton
            className={navHeaderButton}
            data-testid="app-sidebar-arrow-button-back"
            disabled={props.router?.history.current === 0}
            onClick={() => {
              props.router?.back();
            }}
          >
            <ArrowLeftSmallIcon />
          </IconButton>
          <IconButton
            className={navHeaderButton}
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
        </div>
      )}
    </div>
  );
};

export * from './sidebar-switch';
