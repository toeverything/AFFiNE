import { notify, Switch } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { DesktopApiService } from '@affine/core/modules/desktop-api';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import {
  DISK_SYNC_FOLDERS_GLOBAL_STATE_KEY,
  getDiskSyncFolderPath,
  setDiskSyncFolderPath,
} from '@affine/core/modules/workspace-engine/impls/disk-config';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

export const DiskSyncPanel = ({ workspaceId }: { workspaceId: string }) => {
  const desktopApi = useService(DesktopApiService);
  const featureFlagService = useService(FeatureFlagService);
  const enabled = useLiveData(featureFlagService.flags.enable_disk_sync.$);
  const [folder, setFolder] = useState<string | null>(() =>
    getDiskSyncFolderPath(workspaceId)
  );

  useEffect(() => {
    setFolder(getDiskSyncFolderPath(workspaceId));
    const unwatch = desktopApi.sharedStorage.globalState.watch<
      Record<string, string>
    >(DISK_SYNC_FOLDERS_GLOBAL_STATE_KEY, folders => {
      const next = folders?.[workspaceId];
      setFolder(typeof next === 'string' && next.length > 0 ? next : null);
    });
    return () => {
      unwatch();
    };
  }, [desktopApi.sharedStorage.globalState, workspaceId]);

  const onToggle = useCallback(
    (checked: boolean) => {
      featureFlagService.flags.enable_disk_sync.set(checked);
    },
    [featureFlagService]
  );

  const onChooseFolder = useAsyncCallback(async () => {
    const result = await desktopApi.handler.dialog.selectMarkdownSyncFolder();
    if (result?.canceled || !result?.filePath) {
      return;
    }
    if (result.filePath === folder) {
      return;
    }
    setDiskSyncFolderPath(workspaceId, result.filePath);
    setFolder(result.filePath);
    if (enabled) {
      window.location.reload();
      return;
    }
    notify.success({
      title: 'Disk sync folder updated',
    });
  }, [desktopApi.handler.dialog, enabled, folder, workspaceId]);

  const onClearFolder = useCallback(() => {
    if (!folder) {
      return;
    }
    setDiskSyncFolderPath(workspaceId, null);
    setFolder(null);
    if (enabled) {
      window.location.reload();
    }
  }, [enabled, folder, workspaceId]);

  return (
    <>
      <SettingRow
        name={'Markdown Folder Sync (Experimental)'}
        desc={'Sync pages with Markdown files in a local folder.'}
      >
        <Switch
          aria-label="Disk Markdown Sync"
          data-testid="disk-sync-toggle"
          checked={!!enabled}
          onChange={onToggle}
        />
      </SettingRow>
      <SettingRow
        name={'Sync Folder'}
        desc={folder ?? 'No folder selected'}
        spreadCol={false}
      >
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button
            data-testid="disk-sync-choose-folder"
            disabled={!enabled}
            onClick={onChooseFolder}
          >
            Choose Folder
          </Button>
          {folder ? (
            <Button
              data-testid="disk-sync-clear-folder"
              disabled={!enabled}
              onClick={onClearFolder}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </SettingRow>
      {enabled && folder ? (
        <SettingRow
          name={'Review Markdown changes'}
          desc={`Changes to existing files are saved in ${folder}/.affine-sync/candidates. Review a candidate, then copy it over the Markdown file with the same id to accept it.`}
          spreadCol={false}
        />
      ) : null}
    </>
  );
};
