import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ImportIcon, PlusIcon } from '@blocksuite/icons';
import { MenuItem } from '@toeverything/components/menu';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import { openCreateWorkspaceModalAtom } from '../../../../../atoms';
import * as styles from './index.css';

export const AddWorkspace = ({ onEventEnd }: { onEventEnd?: () => void }) => {
  const setOpenCreateWorkspaceModal = useSetAtom(openCreateWorkspaceModalAtom);

  const onNewWorkspace = useCallback(() => {
    setOpenCreateWorkspaceModal('new');
    onEventEnd?.();
  }, [onEventEnd, setOpenCreateWorkspaceModal]);

  const onAddWorkspace = useCallback(async () => {
    setOpenCreateWorkspaceModal('add');
    onEventEnd?.();
  }, [onEventEnd, setOpenCreateWorkspaceModal]);

  const t = useAFFiNEI18N();
  return (
    <div>
      {runtimeConfig.enableSQLiteProvider && environment.isDesktop ? (
        <MenuItem
          block={true}
          preFix={<ImportIcon />}
          onClick={onAddWorkspace}
          data-testid="add-workspace"
          className={styles.ItemContainer}
        >
          <div className={styles.ItemText}>
            {t['com.affine.workspace.local.import']()}
          </div>
        </MenuItem>
      ) : null}
      <MenuItem
        block={true}
        preFix={<PlusIcon />}
        onClick={onNewWorkspace}
        data-testid="new-workspace"
        className={styles.ItemContainer}
      >
        <div className={styles.ItemText}>
          {t['com.affine.workspaceList.addWorkspace.create']()}
        </div>
      </MenuItem>
    </div>
  );
};
