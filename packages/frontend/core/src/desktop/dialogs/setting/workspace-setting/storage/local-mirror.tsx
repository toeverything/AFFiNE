import { Button, notify, Switch, useConfirmModal } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import {
  LocalMirrorService,
  type LocalMirrorStatus,
} from '@affine/core/modules/local-mirror';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

function statusLabel(status: LocalMirrorStatus) {
  switch (status.type) {
    case 'syncing':
      return `Syncing ${status.completed}/${status.total}`;
    case 'idle':
      return status.lastCompletedAt
        ? `Up to date · ${new Date(status.lastCompletedAt).toLocaleString()}`
        : 'Ready';
    case 'conflict':
      return `${status.paths.length} local change${status.paths.length === 1 ? '' : 's'} need attention`;
    case 'error':
      return `Error: ${status.message}`;
    case 'not-configured':
      return 'Choose a project directory';
    case 'permission-denied':
      return 'Export permission denied';
    case 'feature-disabled':
      return 'Experiment disabled';
    default:
      return 'Disabled';
  }
}

export const DesktopLocalMirrorPanel = () => {
  const service = useService(LocalMirrorService);
  const config = useLiveData(service.config$);
  const status = useLiveData(service.status$);
  const { openConfirmModal } = useConfirmModal();

  const reportError = useCallback((error: unknown) => {
    notify.error({
      title: 'Local workspace mirror failed',
      message: (error as Error).message,
    });
  }, []);

  const chooseDirectory = useCallback(async () => {
    try {
      await service.selectProjectRoot();
    } catch (error) {
      reportError(error);
    }
  }, [reportError, service]);

  const enable = useCallback(async () => {
    try {
      if (!config.projectRoot && !(await service.selectProjectRoot())) return;
      service.setEnabled(true);
    } catch (error) {
      reportError(error);
    }
  }, [config.projectRoot, reportError, service]);

  const toggle = useCallback(
    (checked: boolean) => {
      if (!checked) {
        service.setEnabled(false);
        return;
      }
      openConfirmModal({
        title: 'Enable local workspace mirror?',
        children:
          'AFFiNE will write this workspace into a .affine folder. These files may be included in Git commits or published with the project, so review the repository visibility first.',
        confirmText: 'Enable mirror',
        cancelText: 'Cancel',
        onConfirm: enable,
        confirmButtonOptions: { variant: 'primary' },
      });
    },
    [enable, openConfirmModal, service]
  );

  const replace = useCallback(() => {
    openConfirmModal({
      title: 'Replace local changes?',
      children:
        'All locally modified files managed by this AFFiNE mirror will be replaced by the current workspace content. Unknown files are preserved.',
      confirmText: 'Replace local changes',
      cancelText: 'Cancel',
      onConfirm: () => service.replaceLocalChanges(),
      confirmButtonOptions: { variant: 'error' },
    });
  }, [openConfirmModal, service]);

  const mirrorPath = config.projectRoot
    ? `${config.projectRoot.replace(/[\\/]$/, '')}/.affine`
    : 'No project directory selected';

  return (
    <>
      <SettingRow
        name="Local workspace mirror"
        desc="Keep an agent-readable, one-way copy of this workspace on disk. AFFiNE remains canonical."
      >
        <Switch
          checked={config.enabled}
          onChange={toggle}
          data-testid="local-workspace-mirror-enabled"
        />
      </SettingRow>
      <SettingRow name="Project directory" desc={mirrorPath}>
        <Button
          onClick={() => {
            chooseDirectory().catch(reportError);
          }}
        >
          Choose folder
        </Button>
      </SettingRow>
      <SettingRow name="Mirror status" desc={statusLabel(status)}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button disabled={!config.enabled} onClick={() => service.syncNow()}>
            Sync now
          </Button>
          <Button
            disabled={!config.projectRoot}
            onClick={() => {
              service.revealMirror().catch(reportError);
            }}
          >
            Open folder
          </Button>
          {status.type === 'conflict' ? (
            <Button variant="error" onClick={replace}>
              Replace local changes
            </Button>
          ) : null}
        </div>
      </SettingRow>
      <div
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
        }}
      >
        {statusLabel(status)}
      </div>
    </>
  );
};
