import { Button } from '@affine/component/ui/button';
import { AffineShapeIcon } from '@affine/core/components/page-list'; // TODO: import from page-list temporarily, need to defined common svg icon/images management.
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useWorkspaceStatus } from '@affine/core/hooks/use-workspace-status';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useService, Workspace, WorkspaceManager } from '@toeverything/infra';
import { useState } from 'react';

import { mixpanel } from '../../utils';
import * as styles from './upgrade.css';
import { ArrowCircleIcon, HeartBreakIcon } from './upgrade-icon';

/**
 * TODO: Help info is not implemented yet.
 */
export const WorkspaceUpgrade = function WorkspaceUpgrade() {
  const [error, setError] = useState<string | null>(null);
  const currentWorkspace = useService(Workspace);
  const workspaceManager = useService(WorkspaceManager);
  const upgradeStatus = useWorkspaceStatus(currentWorkspace, s => s.upgrade);
  const t = useAFFiNEI18N();

  const onButtonClick = useAsyncCallback(async () => {
    if (upgradeStatus?.upgrading) {
      return;
    }

    mixpanel.track('Button', {
      resolve: 'UpgradeWorkspace',
    });

    try {
      const newWorkspace =
        await currentWorkspace.upgrade.upgrade(workspaceManager);
      if (newWorkspace) {
        location.pathname = `/workspace/${newWorkspace.id}/all`;
        //FIXME: use openPage will cause a bug, which will cause the 'v1 to v4' test fail.
        // params.workspaceId will not be updated, so the page will not be re-rendered and still show the 404 page.
        // openPage(newWorkspace.id, WorkspaceSubPath.ALL);
      } else {
        // blocksuite may enter an incorrect state, reload to reset it.
        location.reload();
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : '' + error);
    }
  }, [upgradeStatus?.upgrading, currentWorkspace.upgrade, workspaceManager]);

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
          icon={
            error ? (
              <HeartBreakIcon />
            ) : (
              <ArrowCircleIcon
                className={
                  upgradeStatus?.upgrading ? styles.loadingIcon : undefined
                }
              />
            )
          }
          type={error ? 'error' : 'default'}
        >
          {error
            ? t['com.affine.upgrade.button-text.error']()
            : upgradeStatus?.upgrading
              ? t['com.affine.upgrade.button-text.upgrading']()
              : t['com.affine.upgrade.button-text.pending']()}
        </Button>
      </div>
    </div>
  );
};
