import { MenuItem } from '@affine/component/ui/menu';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ImportIcon, PlusIcon } from '@blocksuite/icons/rc';

import * as styles from './index.css';

export const AddWorkspace = ({
  onAddWorkspace,
  onNewWorkspace,
}: {
  onAddWorkspace?: () => void;
  onNewWorkspace?: () => void;
}) => {
  const t = useAFFiNEI18N();

  return (
    <div>
      {environment.isDesktop ? (
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
          {runtimeConfig.allowLocalWorkspace
            ? t['com.affine.workspaceList.addWorkspace.create']()
            : t['com.affine.workspaceList.addWorkspace.create-cloud']()}
        </div>
      </MenuItem>
    </div>
  );
};
