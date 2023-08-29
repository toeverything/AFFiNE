import { ConfirmModal } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import type { AffineOfficialWorkspace } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon } from '@blocksuite/icons';
import { useCallback, useState } from 'react';

import type { WorkspaceSettingDetailProps } from '../index';
import { WorkspaceDeleteModal } from './delete';

export interface DeleteLeaveWorkspaceProps extends WorkspaceSettingDetailProps {
  workspace: AffineOfficialWorkspace;
}

export const DeleteLeaveWorkspace = ({
  workspace,
  onDeleteCloudWorkspace,
  onDeleteLocalWorkspace,
  onLeaveWorkspace,
  isOwner,
}: DeleteLeaveWorkspaceProps) => {
  const t = useAFFiNEI18N();
  // fixme: cloud regression
  const [showDelete, setShowDelete] = useState(false);
  const [showLeave, setShowLeave] = useState(false);

  const onLeaveOrDelete = useCallback(() => {
    if (isOwner) {
      setShowDelete(true);
    } else {
      setShowLeave(true);
    }
  }, [isOwner]);

  const onCloseLeaveModal = useCallback(() => {
    setShowLeave(false);
  }, []);

  const onLeaveConfirm = useCallback(() => {
    return onLeaveWorkspace();
  }, [onLeaveWorkspace]);

  const onDeleteConfirm = useCallback(() => {
    if (workspace.flavour === WorkspaceFlavour.LOCAL) {
      return onDeleteLocalWorkspace();
    }
    if (workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD) {
      return onDeleteCloudWorkspace();
    }
  }, [onDeleteCloudWorkspace, onDeleteLocalWorkspace, workspace.flavour]);

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
        data-testid="delete-workspace-button"
      >
        <ArrowRightSmallIcon />
      </SettingRow>
      {isOwner ? (
        <WorkspaceDeleteModal
          onConfirm={onDeleteConfirm}
          open={showDelete}
          onClose={() => {
            setShowDelete(false);
          }}
          workspace={workspace}
        />
      ) : (
        <ConfirmModal
          open={showLeave}
          onConfirm={onLeaveConfirm}
          onCancel={onCloseLeaveModal}
          onClose={onCloseLeaveModal}
          title={`${t['Leave Workspace']()}?`}
          content={t['Leave Workspace hint']()}
          confirmType="warning"
          confirmText={t['Leave']()}
        />
      )}
    </>
  );
};
