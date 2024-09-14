import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { AffineShapeIcon } from '@affine/core/components/page-list'; // TODO(@eyhn): import from page-list temporarily, need to defined common svg icon/images management.
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { useLiveData, useService, WorkspaceService } from '@toeverything/infra';
import { useState } from 'react';

import * as styles from './upgrade.css';
import { ArrowCircleIcon, HeartBreakIcon } from './upgrade-icon';

/**
 * TODO(@eyhn): Help info is not implemented yet.
 */
export const WorkspaceUpgrade = function WorkspaceUpgrade() {
  const [error, setError] = useState<string | null>(null);
  const currentWorkspace = useService(WorkspaceService).workspace;
  const upgrading = useLiveData(currentWorkspace.upgrade.upgrading$);
  const t = useI18n();
  const { openPage } = useNavigateHelper();

  const onButtonClick = useAsyncCallback(async () => {
    if (upgrading) {
      return;
    }

    track.workspace.$.$.upgradeWorkspace();

    try {
      const newWorkspace = await currentWorkspace.upgrade.upgrade();
      if (newWorkspace) {
        openPage(newWorkspace.id, 'all');
      } else {
        // blocksuite may enter an incorrect state, reload to reset it.
        location.reload();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '' + error);
    }
  }, [upgrading, currentWorkspace.upgrade, openPage]);

  return (
    <div className={styles.layout}>
      <div className={styles.upgradeBox}>
        <AffineShapeIcon width={180} height={180} />
        <p className={styles.upgradeTips}>
          {error ? error : t['com.affine.upgrade.tips.normal']()}
        </p>
        <Button
          data-testid="upgrade-workspace-button"
          onClick={onButtonClick}
          size="extraLarge"
          loading={upgrading}
          prefix={error ? <HeartBreakIcon /> : <ArrowCircleIcon />}
          variant={error ? 'error' : 'secondary'}
        >
          {error
            ? t['com.affine.upgrade.button-text.error']()
            : upgrading
              ? t['com.affine.upgrade.button-text.upgrading']()
              : t['com.affine.upgrade.button-text.pending']()}
        </Button>
      </div>
    </div>
  );
};
