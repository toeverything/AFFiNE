import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { useWorkspace } from '@affine/core/components/hooks/use-workspace';
import { useWorkspaceInfo } from '@affine/core/components/hooks/use-workspace-info';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { useI18n } from '@affine/i18n';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { FrameworkScope } from '@toeverything/infra';
import { useCallback } from 'react';

import { DeleteLeaveWorkspace } from './delete-leave-workspace';
import { EnableCloudPanel } from './enable-cloud';
import { ExportPanel } from './export';
import { LabelsPanel } from './labels';
import { MembersPanel } from './members';
import { ProfilePanel } from './profile';
import { SharingPanel } from './sharing';
import type { WorkspaceSettingDetailProps } from './types';

export const WorkspaceSettingDetail = ({
  workspaceMetadata,
}: WorkspaceSettingDetailProps) => {
  const t = useI18n();

  // useWorkspace hook is a vary heavy operation here, but we need syncing name and avatar changes here,
  // we don't have a better way to do this now
  const workspace = useWorkspace(workspaceMetadata);

  const workspaceInfo = useWorkspaceInfo(workspaceMetadata);

  const handleResetSyncStatus = useCallback(() => {
    workspace?.engine.doc
      .resetSyncStatus()
      .then(() => {
        window.location.reload();
      })
      .catch(err => {
        console.error(err);
      });
  }, [workspace]);

  if (!workspace) {
    return null;
  }

  return (
    <FrameworkScope scope={workspace.scope}>
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
          <ProfilePanel />
          <LabelsPanel />
        </SettingRow>
      </SettingWrapper>
      <SettingWrapper title={t['com.affine.brand.affineCloud']()}>
        <EnableCloudPanel />
        <MembersPanel />
      </SettingWrapper>
      <SharingPanel />
      {BUILD_CONFIG.isElectron && (
        <SettingWrapper title={t['Storage and Export']()}>
          <ExportPanel
            workspace={workspace}
            workspaceMetadata={workspaceMetadata}
          />
        </SettingWrapper>
      )}
      <SettingWrapper>
        <DeleteLeaveWorkspace />
        <SettingRow
          name={
            <span style={{ color: 'var(--affine-text-secondary-color)' }}>
              {t['com.affine.resetSyncStatus.button']()}
            </span>
          }
          desc={t['com.affine.resetSyncStatus.description']()}
          style={{ cursor: 'pointer' }}
          onClick={handleResetSyncStatus}
          data-testid="reset-sync-status"
        >
          <ArrowRightSmallIcon />
        </SettingRow>
      </SettingWrapper>
    </FrameworkScope>
  );
};
