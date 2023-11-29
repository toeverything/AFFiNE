import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useMemo } from 'react';

import { useWorkspace } from '../../../hooks/use-workspace';
import { DeleteLeaveWorkspace } from './delete-leave-workspace';
import { ExportPanel } from './export';
import { LabelsPanel } from './labels';
import { MembersPanel } from './members';
import { ProfilePanel } from './profile';
import { PublishPanel } from './publish';
import { StoragePanel } from './storage';
import type { WorkspaceSettingDetailProps } from './types';

export const WorkspaceSettingDetail = (props: WorkspaceSettingDetailProps) => {
  const { workspaceId } = props;
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
        subtitle={t['com.affine.settings.workspace.description']()}
      />
      <SettingWrapper title={t['Info']()}>
        <SettingRow
          name={t['Workspace Profile']()}
          desc={t['com.affine.settings.workspace.not-owner']()}
          spreadCol={false}
        >
          <ProfilePanel workspace={workspace} {...props} />
          <LabelsPanel workspace={workspace} {...props} />
        </SettingRow>
      </SettingWrapper>
      <SettingWrapper title={t['com.affine.brand.affineCloud']()}>
        <PublishPanel workspace={workspace} {...props} />
        <MembersPanel workspace={workspace} {...props} />
      </SettingWrapper>
      {storageAndExportSetting}
      <SettingWrapper>
        <DeleteLeaveWorkspace workspace={workspace} {...props} />
      </SettingWrapper>
    </>
  );
};
