import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import { useAtomValue } from 'jotai';
import { useMemo } from 'react';

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
  generalShortcutsInfo?: {
    shortcuts: {
      [title: string]: string[];
    };
  };
};

export const SidebarHeader = (props: SidebarHeaderProps) => {
  const open = useAtomValue(appSidebarOpenAtom);
  const t = useAFFiNEI18N();

  const shortcuts = props.generalShortcutsInfo?.shortcuts;
  const shortcutsObject = useMemo(() => {
    const goBack = t['com.affine.keyboardShortcuts.goBack']();
    const goBackShortcut = shortcuts?.[goBack];

    const goForward = t['com.affine.keyboardShortcuts.goForward']();
    const goForwardShortcut = shortcuts?.[goForward];
    return {
      goBack,
      goBackShortcut,
      goForward,
      goForwardShortcut,
    };
  }, [shortcuts, t]);

  return (
    <div
      className={navHeaderStyle}
      data-open={open}
      data-is-macos-electron={environment.isDesktop && environment.isMacOs}
    >
      <SidebarSwitch show={open} />
      <div className={navHeaderNavigationButtons}>
        <Tooltip
          content={`${shortcutsObject.goBack} ${shortcutsObject.goBackShortcut}`}
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
          content={`${shortcutsObject.goForward} ${shortcutsObject.goForwardShortcut}`}
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
