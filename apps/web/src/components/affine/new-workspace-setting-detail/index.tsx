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
import { ExportPanel } from './export';
import { WorkspaceLeave } from './leave';
import { ProfilePanel } from './profile';
import { StoragePanel } from './storage';

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
  const isOwner = useIsWorkspaceOwner(workspace);
  const [name] = useBlockSuiteWorkspaceName(workspace.blockSuiteWorkspace);

  const [showDelete, setShowDelete] = useState(false);
  const [showLeave, setShowLeave] = useState(false);

  return (
    <>
      <SettingHeader
        title={t[`Workspace Settings with name`]({ name })}
        subtitle={t['You can customize your workspace here.']()}
      />
      <SettingWrapper title={t['Info']()}>
        <SettingRow
          name={t['Workspace Profile']()}
          desc={t[
            'Only an owner can edit the the Workspace avatar and name.Changes will be shown for everyone.'
          ]()}
          spreadCol={false}
        >
          <ProfilePanel workspace={workspace} />
        </SettingRow>
      </SettingWrapper>
      <SettingWrapper title={t['AFFiNE Cloud']()}></SettingWrapper>
      {environment.isDesktop ? (
        <SettingWrapper title={t['Storage and Export']()}>
          <StoragePanel workspace={workspace} />
          <ExportPanel workspace={workspace} />
        </SettingWrapper>
      ) : null}

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
