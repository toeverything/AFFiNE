import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

import {
  EdgelessSwitchItem,
  PageSwitchItem,
} from '../../../blocksuite/block-suite-mode-switch/switch-items';
import type { EdgelessSwitchMode } from '../types';
import * as styles from './style.css';

interface EdgelessSwitchProps extends HTMLAttributes<HTMLDivElement> {
  mode: EdgelessSwitchMode;
  onSwitchToPageMode: () => void;
  onSwitchToEdgelessMode: () => void;
}

export const EdgelessSwitchButtons = ({
  mode,
  className,
  onSwitchToPageMode,
  onSwitchToEdgelessMode,
  ...attrs
}: EdgelessSwitchProps) => {
  return (
    <div
      data-mode={mode}
      className={clsx(styles.switchButtons, className)}
      {...attrs}
    >
      <PageSwitchItem
        className={styles.switchButton}
        data-active={mode === 'page'}
        onClick={onSwitchToPageMode}
      />
      <EdgelessSwitchItem
        className={styles.switchButton}
        data-active={mode === 'edgeless'}
        onClick={onSwitchToEdgelessMode}
      />
    </div>
  );
};
