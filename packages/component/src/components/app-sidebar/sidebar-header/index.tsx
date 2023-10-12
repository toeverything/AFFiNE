import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
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
  const t = useAFFiNEI18N();
  const isMacos =
    (environment.isBrowser && environment.isMacOs) ||
    (environment.isDesktop && environment.isMacOs);
  return (
    <div
      className={navHeaderStyle}
      data-open={open}
      data-is-macos-electron={environment.isDesktop && environment.isMacOs}
    >
      <SidebarSwitch show={open} />
      <div className={navHeaderNavigationButtons}>
        <Tooltip
          content={`${t['com.affine.keyboardShortcuts.goBack']()}
            ${isMacos ? '⌘ + [' : 'Ctrl + ['}
          `}
          side="bottom"
        >
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
        </Tooltip>
        <Tooltip
          content={`${t['com.affine.keyboardShortcuts.goForward']()}
            ${isMacos ? '⌘ + ]' : 'Ctrl + ]'}
          `}
          side="bottom"
        >
          <IconButton
            className={navHeaderButton}
            data-testid="app-sidebar-arrow-button-forward"
            disabled={
              props.router
                ? (props.router.history.stack.length > 0 &&
                    props.router.history.current ===
                      props.router.history.stack.length - 1) ||
                  props.router.history.stack.length === 0
                : true
            }
            onClick={() => {
              props.router?.forward();
            }}
          >
            <ArrowRightSmallIcon />
          </IconButton>
        </Tooltip>
      </div>
    </div>
  );
};

export * from './sidebar-switch';
