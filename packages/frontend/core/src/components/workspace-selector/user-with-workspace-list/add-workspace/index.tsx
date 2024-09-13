import { MenuItem } from '@affine/component/ui/menu';
import { useI18n } from '@affine/i18n';
import { ImportIcon, PlusIcon } from '@blocksuite/icons/rc';

import * as styles from './index.css';

export const AddWorkspace = ({
  onAddWorkspace,
  onNewWorkspace,
}: {
  onAddWorkspace?: () => void;
  onNewWorkspace?: () => void;
}) => {
  const t = useI18n();

  return (
    <div>
      {environment.isElectron ? (
        <MenuItem
          block={true}
          prefixIcon={<ImportIcon />}
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
        prefixIcon={<PlusIcon />}
        onClick={onNewWorkspace}
        data-testid="new-workspace"
        className={styles.ItemContainer}
      >
        <div className={styles.ItemText}>
          {BUILD_CONFIG.allowLocalWorkspace
            ? t['com.affine.workspaceList.addWorkspace.create']()
            : t['com.affine.workspaceList.addWorkspace.create-cloud']()}
        </div>
      </MenuItem>
    </div>
  );
};
