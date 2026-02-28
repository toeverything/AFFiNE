import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { useWorkspaceInfo } from '@affine/core/components/hooks/use-workspace-info';
import { WorkspaceServerService } from '@affine/core/modules/cloud';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import { useI18n } from '@affine/i18n';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { FrameworkScope, useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';

import { DeleteLeaveWorkspace } from './delete-leave-workspace';
import { CurriculumUploadPanel } from './curriculum-upload';
import { EnableCloudPanel } from './enable-cloud';
import { LabelsPanel } from './labels';
import { ProfilePanel } from './profile';
import { SharingPanel } from './sharing';
import { TemplateDocSetting } from './template';
import type { WorkspaceSettingDetailProps } from './types';

export const WorkspaceSettingDetail = ({
  onCloseSetting,
}: WorkspaceSettingDetailProps) => {
  const t = useI18n();

  const workspace = useService(WorkspaceService).workspace;
  const server = workspace?.scope.get(WorkspaceServerService).server;
  const permissionService = useService(WorkspacePermissionService);

  const workspaceInfo = useWorkspaceInfo(workspace);
  const isOwner = useLiveData(permissionService.permission.isOwner$);

  // Debug flag: set localStorage.affine.debugShowUpload = '1' to force showing the upload panel
  const showUploadForDebug =
    typeof window !== 'undefined' &&
    window.localStorage?.getItem('affine.debugShowUpload') === '1';

  useEffect(() => {
    if (isOwner === null) {
      console.log('WorkspaceSettingDetail: isOwner is null — revalidating permissions');
      permissionService.permission.revalidate();
    } else {
      console.log('WorkspaceSettingDetail: isOwner', isOwner);
    }
  }, [isOwner, permissionService]);

  useEffect(() => {
    console.log('WorkspaceSettingDetail debug', {
      isOwner,
      workspaceId: workspaceInfo?.id,
    });
    if (showUploadForDebug) {
      console.log('WorkspaceSettingDetail: showUploadForDebug is enabled — forcing upload panel');
    }
  }, [isOwner, workspaceInfo?.id]);

  const handleResetSyncStatus = useCallback(() => {
    workspace?.engine.doc
      .resetSync()
      .then(() => {
        onCloseSetting();
      })
      .catch(err => {
        console.error(err);
      });
  }, [onCloseSetting, workspace]);

  return (
    <FrameworkScope scope={server?.scope}>
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
          {workspace.flavour === 'local' && (
            <EnableCloudPanel onCloseSetting={onCloseSetting} />
          )}
        </SettingRow>
      </SettingWrapper>
      <TemplateDocSetting />
      {(isOwner || showUploadForDebug) && (
        <SettingWrapper title={t['com.affine.settings.workspace.curriculum']()}>
          <SettingRow
            name={t['com.affine.settings.workspace.upload-curriculum']()}
            desc={t['com.affine.settings.workspace.upload-curriculum.description']()}
            spreadCol={false}
          >
            <CurriculumUploadPanel />
          </SettingRow>
        </SettingWrapper>
      )}
      <SharingPanel />
      <SettingWrapper>
        <DeleteLeaveWorkspace onCloseSetting={onCloseSetting} />
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
