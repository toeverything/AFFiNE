import { AffineShapeIcon } from '@affine/component/page-list'; // TODO: import from page-list temporarily, need to defined common svg icon/images management.
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { useCallback, useMemo } from 'react';

import * as styles from './upgrade.css';
import { type UpgradeState, useUpgradeWorkspace } from './upgrade-hooks';
import { ArrowCircleIcon, HeartBreakIcon } from './upgrade-icon';

const UPGRADE_TIPS_KEYS = {
  pending: 'com.affine.upgrade.tips.normal',
  upgrading: 'com.affine.upgrade.tips.normal',
  done: 'com.affine.upgrade.tips.done',
  error: 'com.affine.upgrade.tips.error',
} as const;

const BUTTON_TEXT_KEYS = {
  pending: 'com.affine.upgrade.button-text.pending',
  upgrading: 'com.affine.upgrade.button-text.upgrading',
  done: 'com.affine.upgrade.button-text.done',
  error: 'com.affine.upgrade.button-text.error',
} as const;

function UpgradeIcon({ upgradeState }: { upgradeState: UpgradeState }) {
  if (upgradeState === 'error') {
    return <HeartBreakIcon />;
  }
  return (
    <ArrowCircleIcon
      className={upgradeState === 'upgrading' ? styles.loadingIcon : undefined}
    />
  );
}

/**
 * TODO: Help info is not implemented yet.
 */
export const WorkspaceUpgrade = function MigrationFallback() {
  const [upgradeState, , upgradeWorkspace] = useUpgradeWorkspace();
  const t = useAFFiNEI18N();

  const refreshPage = useCallback(() => {
    window.location.reload();
  }, []);

  const onButtonClick = useMemo(() => {
    if (upgradeState === 'done') {
      return refreshPage;
    }

    if (upgradeState === 'pending') {
      return upgradeWorkspace;
    }

    return undefined;
  }, [upgradeState, upgradeWorkspace, refreshPage]);

  return (
    <div className={styles.layout}>
      <div className={styles.upgradeBox}>
        <AffineShapeIcon width={180} height={180} />
        <p className={styles.upgradeTips}>
          {t[UPGRADE_TIPS_KEYS[upgradeState]]()}
        </p>
        <Button
          data-testid="upgrade-workspace-button"
          onClick={onButtonClick}
          size="extraLarge"
          icon={<UpgradeIcon upgradeState={upgradeState} />}
          type={upgradeState === 'error' ? 'error' : 'default'}
        >
          {t[BUTTON_TEXT_KEYS[upgradeState]]()}
        </Button>
      </div>
    </div>
  );
};
