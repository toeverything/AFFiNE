import { IconButton, Tooltip } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons';
import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { useCallback, useEffect, useMemo } from 'react';

import { useGeneralShortcuts } from '../../../hooks/affine/use-shortcuts';
import { Navigator } from '../entities/navigator';
import * as styles from './navigation-buttons.css';
import { useRegisterNavigationCommands } from './use-register-navigation-commands';

export const NavigationButtons = () => {
  const t = useAFFiNEI18N();

  const shortcuts = useGeneralShortcuts().shortcuts;

  useRegisterNavigationCommands();

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

  const navigator = useService(Navigator);

  const backable = useLiveData(navigator.backable);
  const forwardable = useLiveData(navigator.forwardable);

  const handleBack = useCallback(() => {
    navigator.back();
  }, [navigator]);

  const handleForward = useCallback(() => {
    navigator.forward();
  }, [navigator]);

  useEffect(() => {
    const cb = (event: MouseEvent) => {
      if (event.button === 3 || event.button === 4) {
        event.preventDefault();
        event.stopPropagation();

        if (event.button === 3) {
          navigator.back();
        } else {
          navigator.forward();
        }
      }
    };
    document.addEventListener('mouseup', cb);
    return () => {
      document.removeEventListener('mouseup', cb);
    };
  }, [navigator]);

  if (!environment.isDesktop) {
    return null;
  }

  return (
    <div className={styles.container}>
      <Tooltip
        content={`${shortcutsObject.goBack} ${shortcutsObject.goBackShortcut}`}
        side="bottom"
      >
        <IconButton
          className={styles.button}
          data-testid="app-navigation-button-back"
          disabled={!backable}
          onClick={handleBack}
        >
          <ArrowLeftSmallIcon />
        </IconButton>
      </Tooltip>
      <Tooltip
        content={`${shortcutsObject.goForward} ${shortcutsObject.goForwardShortcut}`}
        side="bottom"
      >
        <IconButton
          className={styles.button}
          data-testid="app-navigation-button-forward"
          disabled={!forwardable}
          onClick={handleForward}
        >
          <ArrowRightSmallIcon />
        </IconButton>
      </Tooltip>
    </div>
  );
};
