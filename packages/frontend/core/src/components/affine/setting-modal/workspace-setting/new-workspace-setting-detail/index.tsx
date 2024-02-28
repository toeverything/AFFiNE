import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { useServerFeatures } from '@affine/core/hooks/affine/use-server-config';
import { useWorkspace } from '@affine/core/hooks/use-workspace';
import { useWorkspaceInfo } from '@affine/core/hooks/use-workspace-info';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';

import { DeleteLeaveWorkspace } from './delete-leave-workspace';
import { EnableCloudPanel } from './enable-cloud';
import { ExportPanel } from './export';
import { LabelsPanel } from './labels';
import { MembersPanel } from './members';
import { ProfilePanel } from './profile';
import { StoragePanel } from './storage';
import type { WorkspaceSettingDetailProps } from './types';

export const WorkspaceSettingDetail = (props: WorkspaceSettingDetailProps) => {
  const t = useAFFiNEI18N();
  const { payment: hasPaymentFeature } = useServerFeatures();
  const workspaceMetadata = props.workspaceMetadata;

  // useWorkspace hook is a vary heavy operation here, but we need syncing name and avatar changes here,
  // we don't have a better way to do this now
  const workspace = useWorkspace(workspaceMetadata);

  const workspaceInfo = useWorkspaceInfo(workspaceMetadata);

  return (
    <>
      <SettingHeader
        title={t[`Workspace Settings with name`]({
          name: workspaceInfo?.name ?? UNTITLED_WORKSPACE_NAME,
        })}
        subtitle={t['com.affine.settings.workspace.description']()}
      />
      <SettingWrapper title={t['Info']()}>
        <SettingRow
          name={t['Workspace Profile']()}
          desc={t['com.affine.settings.workspace.not-owner']()}
          spreadCol={false}
        >
          <ProfilePanel workspace={workspace} {...props} />
          <LabelsPanel {...props} />
        </SettingRow>
      </SettingWrapper>
      <SettingWrapper title={t['com.affine.brand.affineCloud']()}>
        <EnableCloudPanel workspace={workspace} {...props} />
        <MembersPanel upgradable={hasPaymentFeature} {...props} />
      </SettingWrapper>
      {environment.isDesktop && (
        <SettingWrapper title={t['Storage and Export']()}>
          {runtimeConfig.enableMoveDatabase ? (
            <StoragePanel workspaceMetadata={workspaceMetadata} />
          ) : null}
          <ExportPanel
            workspace={workspace}
            workspaceMetadata={workspaceMetadata}
          />
        </SettingWrapper>
      )}
      <SettingWrapper>
        <DeleteLeaveWorkspace {...props} />
      </SettingWrapper>
    </>
  );
};
