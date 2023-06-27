import {
  SettingRow,
} from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon } from '@blocksuite/icons';
import { type FC, useState } from 'react';

import { useIsWorkspaceOwner } from '../../../../hooks/affine/use-is-workspace-owner';
import type { AffineOfficialWorkspace } from '../../../../shared';
import type { WorkspaceSettingDetailProps } from '../index';
import { WorkspaceDeleteModal } from './delete';
import { WorkspaceLeave } from './leave';

export const DeleteLeaveWorkspace: FC<{
  workspace: AffineOfficialWorkspace;
  onDeleteWorkspace: WorkspaceSettingDetailProps['onDeleteWorkspace'];
}> = ({ workspace, onDeleteWorkspace }) => {
  const t = useAFFiNEI18N();
  const isOwner = useIsWorkspaceOwner(workspace);

  const [showDelete, setShowDelete] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  return (
    <>
      <SettingRow
        name={
          <span style={{ color: 'var(--affine-error-color)' }}>
            {isOwner ? t['Delete Workspace']() : t['Leave Workspace']()}
          </span>
        }
        desc={t['None yet']()}
        style={{ cursor: 'pointer' }}
        onClick={() => {
          setShowDelete(true);
        }}
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
