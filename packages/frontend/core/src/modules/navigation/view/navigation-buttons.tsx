import { IconButton } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';

import { NavigatorService } from '../services/navigator';
import * as styles from './navigation-buttons.css';

const tooltipSideBottom = { side: 'bottom' as const };

export const NavigationButtons = () => {
  if (!BUILD_CONFIG.isElectron) {
    return null;
  }

  return <ElectronNavigationButtons />;
};

const ElectronNavigationButtons = () => {
  const t = useI18n();

  const navigator = useService(NavigatorService).navigator;

  const backable = useLiveData(navigator.backable$);
  const forwardable = useLiveData(navigator.forwardable$);

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

  return (
    <div className={styles.container}>
      <IconButton
        tooltip={t['Go Back']()}
        tooltipShortcut={['$mod', '[']}
        tooltipOptions={tooltipSideBottom}
        className={styles.button}
        data-testid="app-navigation-button-back"
        disabled={!backable}
        onClick={handleBack}
        size={24}
      >
        <ArrowLeftSmallIcon />
      </IconButton>
      <IconButton
        tooltip={t['Go Forward']()}
        tooltipShortcut={['$mod', ']']}
        tooltipOptions={tooltipSideBottom}
        className={styles.button}
        data-testid="app-navigation-button-forward"
        disabled={!forwardable}
        onClick={handleForward}
        size={24}
      >
        <ArrowRightSmallIcon />
      </IconButton>
    </div>
  );
};
