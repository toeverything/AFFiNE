import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import type {
  WorkspaceFlavour,
  WorkspaceRegistry,
} from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon } from '@blocksuite/icons';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import type { FC } from 'react';
import { useState } from 'react';

import { useIsWorkspaceOwner } from '../../../hooks/affine/use-is-workspace-owner';
import type { AffineOfficialWorkspace } from '../../../shared';
import { WorkspaceDeleteModal } from './delete';
import { WorkspaceLeave } from './leave';

export type WorkspaceSettingDetailProps = {
  workspace: AffineOfficialWorkspace;
  onDeleteWorkspace: () => Promise<void>;
  onTransferWorkspace: <
    From extends WorkspaceFlavour,
    To extends WorkspaceFlavour
  >(
    from: From,
    to: To,
    workspace: WorkspaceRegistry[From]
  ) => void;
};

export const WorkspaceSettingDetail: FC<WorkspaceSettingDetailProps> = ({
  workspace,
  onDeleteWorkspace,
}) => {
  const t = useAFFiNEI18N();
  const [workspaceName] = useBlockSuiteWorkspaceName(
    workspace.blockSuiteWorkspace ?? null
  );
  const isOwner = useIsWorkspaceOwner(workspace);

  const [showDelete, setShowDelete] = useState(false);
  const [showLeave, setShowLeave] = useState(false);
  return (
    <>
      <SettingHeader
        title={t[`Workspace demo's Settings`]()}
        subtitle={t['You can customize your workspace here.']()}
      />
      {workspaceName}

      <SettingWrapper title={t['Info']()}></SettingWrapper>
      <SettingWrapper title={t['AFFiNE Cloud']()}></SettingWrapper>
      <SettingWrapper title={t['Storage and Export']()}></SettingWrapper>
      <SettingWrapper>
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
      </SettingWrapper>

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
