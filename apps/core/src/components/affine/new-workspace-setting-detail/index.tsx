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
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useMemo } from 'react';

import { useWorkspace } from '../../../hooks/use-workspace';
import { DeleteLeaveWorkspace } from './delete-leave-workspace';
import { ExportPanel } from './export';
import { ProfilePanel } from './profile';
import { PublishPanel } from './publish';
import { StoragePanel } from './storage';

export interface WorkspaceSettingDetailProps {
  workspaceId: string;
  onDeleteWorkspace: (id: string) => Promise<void>;
  onTransferWorkspace: <
    From extends WorkspaceFlavour,
    To extends WorkspaceFlavour,
  >(
    from: From,
    to: To,
    workspace: WorkspaceRegistry[From]
  ) => void;
}

export const WorkspaceSettingDetail = ({
  workspaceId,
  onDeleteWorkspace,
  ...props
}: WorkspaceSettingDetailProps) => {
  const t = useAFFiNEI18N();
  const workspace = useWorkspace(workspaceId);
  const [name] = useBlockSuiteWorkspaceName(workspace.blockSuiteWorkspace);

  const storageAndExportSetting = useMemo(() => {
    if (environment.isDesktop) {
      return (
        <SettingWrapper title={t['Storage and Export']()}>
          {runtimeConfig.enableMoveDatabase ? (
            <StoragePanel workspace={workspace} />
          ) : null}
          <ExportPanel workspace={workspace} />
        </SettingWrapper>
      );
    } else {
      return null;
    }
  }, [t, workspace]);

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
      <SettingWrapper title={t['AFFiNE Cloud']()}>
        <PublishPanel
          workspace={workspace}
          onDeleteWorkspace={onDeleteWorkspace}
          {...props}
        />
      </SettingWrapper>
      {storageAndExportSetting}
      <SettingWrapper>
        <DeleteLeaveWorkspace
          workspace={workspace}
          onDeleteWorkspace={onDeleteWorkspace}
        />
      </SettingWrapper>
    </>
  );
};
