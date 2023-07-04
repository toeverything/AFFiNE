import { SettingRow } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon } from '@blocksuite/icons';
import { type FC, useState } from 'react';

import type { AffineOfficialWorkspace } from '../../../../shared';
import type { WorkspaceSettingDetailProps } from '../index';
import { WorkspaceDeleteModal } from './delete';
import { WorkspaceLeave } from './leave';

export const DeleteLeaveWorkspace: FC<{
  workspace: AffineOfficialWorkspace;
  onDeleteWorkspace: WorkspaceSettingDetailProps['onDeleteWorkspace'];
}> = ({ workspace, onDeleteWorkspace }) => {
  const t = useAFFiNEI18N();
  // fixme: cloud regression
  const isOwner = true;

  const [showDelete, setShowDelete] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  return (
    <>
      <SettingRow
        name={
          <span style={{ color: 'var(--affine-error-color)' }}>
            {isOwner
              ? t['com.affine.settings.workspace.remove']()
              : t['Leave Workspace']()}
          </span>
        }
        desc={t['com.affine.settings.workspace.remove.message']()}
        style={{ cursor: 'pointer' }}
        onClick={() => {
          setShowDelete(true);
        }}
        testId="delete-workspace-button"
      >
        <ArrowRightSmallIcon />
      </SettingRow>
      {isOwner ? (
        <WorkspaceDeleteModal
          onDeleteWorkspace={onDeleteWorkspace}
          open={showDelete}
          onClose={() => {
            setShowDelete(false);
          }}
          workspace={workspace}
        />
      ) : (
        <WorkspaceLeave
          open={showLeave}
          onClose={() => {
            setShowLeave(false);
          }}
        />
      )}
    </>
  );
};
