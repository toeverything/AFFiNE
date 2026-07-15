import {
  SettingHeader,
  SettingWrapper,
} from '@affine/component/setting-components';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';

import { EnableCloudPanel } from '../preference/enable-cloud';
import { BlobManagementPanel } from './blob-management';
import { DesktopExportPanel } from './export';
import { DesktopLocalMirrorPanel } from './local-mirror';
import { WorkspaceQuotaPanel } from './workspace-quota';

export const WorkspaceSettingStorage = ({
  onCloseSetting,
}: {
  onCloseSetting: () => void;
}) => {
  const t = useI18n();
  const workspace = useService(WorkspaceService).workspace;
  const workspacePermissionService = useService(
    WorkspacePermissionService
  ).permission;
  const isTeam = useLiveData(workspacePermissionService.isTeam$);
  const isOwner = useLiveData(workspacePermissionService.isOwner$);
  const localMirrorEnabled = useLiveData(
    useService(FeatureFlagService).flags.enable_local_workspace_mirror.$
  );

  const canExport = !isTeam || isOwner;
  const canMirror =
    workspace.flavour === 'local' ||
    isTeam === false ||
    (isTeam === true && isOwner === true);
  return (
    <>
      <SettingHeader
        title={t['Storage']()}
        subtitle={t['com.affine.settings.workspace.storage.subtitle']()}
      />
      {BUILD_CONFIG.isElectron && localMirrorEnabled && canMirror ? (
        <SettingWrapper>
          <DesktopLocalMirrorPanel />
        </SettingWrapper>
      ) : null}
      {workspace.flavour === 'local' ? (
        <>
          <EnableCloudPanel onCloseSetting={onCloseSetting} />{' '}
          {BUILD_CONFIG.isElectron && (
            <SettingWrapper>
              <DesktopExportPanel workspace={workspace} />
            </SettingWrapper>
          )}
        </>
      ) : (
        <>
          {isTeam ? (
            <SettingWrapper>
              <WorkspaceQuotaPanel />
            </SettingWrapper>
          ) : null}

          {BUILD_CONFIG.isElectron && canExport && (
            <SettingWrapper>
              <DesktopExportPanel workspace={workspace} />
            </SettingWrapper>
          )}

          <SettingWrapper>
            <BlobManagementPanel />
          </SettingWrapper>
        </>
      )}
    </>
  );
};
