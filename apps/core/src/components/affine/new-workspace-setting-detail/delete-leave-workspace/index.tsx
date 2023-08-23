import { ConfirmModal } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import type { AffineOfficialWorkspace } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon } from '@blocksuite/icons';
import { useCallback, useState } from 'react';

import { useLeaveWorkspace } from '../../../../hooks/affine/use-leave-workspace';
import type { WorkspaceSettingDetailProps } from '../index';
import { WorkspaceDeleteModal } from './delete';

interface DeleteLeaveWorkspaceProps {
  workspace: AffineOfficialWorkspace;
  onDeleteWorkspace: WorkspaceSettingDetailProps['onDeleteWorkspace'];
  isOwner: boolean;
}

export const DeleteLeaveWorkspace = ({
  workspace,
  onDeleteWorkspace,
  isOwner,
}: DeleteLeaveWorkspaceProps) => {
  const t = useAFFiNEI18N();
  // fixme: cloud regression
  const leaveWorkspace = useLeaveWorkspace(workspace.id);

  const [showDelete, setShowDelete] = useState(false);
  const [showLeave, setShowLeave] = useState(false);

  const onLeaveOrDelete = useCallback(() => {
    if (isOwner) {
      setShowDelete(true);
    } else {
      setShowLeave(true);
    }
  }, [isOwner]);

  const onCloseConfirmModal = useCallback(() => {
    setShowLeave(false);
  }, []);

  return (
    <>
      <SettingRow
        name={
          <span style={{ color: 'var(--affine-error-color)' }}>
            {isOwner
              ? t['com.affine.settings.remove-workspace']()
              : t['Leave Workspace']()}
          </span>
        }
        desc={t['com.affine.settings.remove-workspace-description']()}
        style={{ cursor: 'pointer' }}
        onClick={onLeaveOrDelete}
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
        <ConfirmModal
          open={showLeave}
          onConfirm={leaveWorkspace}
          onCancel={onCloseConfirmModal}
          onClose={onCloseConfirmModal}
          title={`${t['Leave Workspace']()}?`}
          content={t['Leave Workspace hint']()}
          confirmType="warning"
          confirmText={t['Leave']()}
        />
      )}
    </>
  );
};
