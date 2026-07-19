import { Button, notify, Switch, useConfirmModal } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import {
  LocalMirrorService,
  type LocalMirrorStatus,
} from '@affine/core/modules/local-mirror';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

export function canUseAffineVersion(status: LocalMirrorStatus) {
  return (
    status.type === 'conflict' ||
    status.type === 'merge-conflict' ||
    status.type === 'unsupported-local-change' ||
    status.type === 'migration-conflict'
  );
}

export function canRetryLocalMirror(status: LocalMirrorStatus) {
  return (
    status.type === 'external-change-pending' ||
    status.type === 'merge-conflict' ||
    status.type === 'unsupported-local-change' ||
    status.type === 'migration-conflict' ||
    status.type === 'error'
  );
}

export const DesktopLocalMirrorPanel = () => {
  const t = useI18n();
  const service = useService(LocalMirrorService);
  const config = useLiveData(service.config$);
  const status = useLiveData(service.status$);
  const { openConfirmModal } = useConfirmModal();

  const statusText = (() => {
    switch (status.type) {
      case 'syncing':
        return t[
          'com.affine.settings.workspace.storage.local-mirror.status.syncing'
        ]({
          completed: String(status.completed),
          total: String(status.total),
        });
      case 'importing':
        return t[
          'com.affine.settings.workspace.storage.local-mirror.status.importing'
        ]({
          completed: String(status.completed),
          total: String(status.total),
        });
      case 'external-change-pending':
        return t[
          'com.affine.settings.workspace.storage.local-mirror.status.external-change-pending'
        ]();
      case 'merge-conflict':
        return t[
          'com.affine.settings.workspace.storage.local-mirror.status.merge-conflict'
        ]({ path: status.path });
      case 'unsupported-local-change':
        return t[
          'com.affine.settings.workspace.storage.local-mirror.status.unsupported-local-change'
        ]({ message: status.message });
      case 'migration-conflict':
        return t[
          'com.affine.settings.workspace.storage.local-mirror.status.migration-conflict'
        ]({ count: String(status.paths.length) });
      case 'idle':
        return status.lastCompletedAt
          ? t[
              'com.affine.settings.workspace.storage.local-mirror.status.up-to-date'
            ]({ time: new Date(status.lastCompletedAt).toLocaleString() })
          : t[
              'com.affine.settings.workspace.storage.local-mirror.status.ready'
            ]();
      case 'conflict':
        return t[
          'com.affine.settings.workspace.storage.local-mirror.status.conflict'
        ]({ count: String(status.paths.length) });
      case 'error':
        return t[
          'com.affine.settings.workspace.storage.local-mirror.status.error'
        ]({ message: status.message });
      case 'not-configured':
        return t[
          'com.affine.settings.workspace.storage.local-mirror.status.not-configured'
        ]();
      case 'permission-denied':
        return status.path
          ? t[
              'com.affine.settings.workspace.storage.local-mirror.status.document-permission-denied'
            ]({ path: status.path })
          : t[
              'com.affine.settings.workspace.storage.local-mirror.status.permission-denied'
            ]();
      case 'feature-disabled':
        return t[
          'com.affine.settings.workspace.storage.local-mirror.status.feature-disabled'
        ]();
      default:
        return t[
          'com.affine.settings.workspace.storage.local-mirror.status.disabled'
        ]();
    }
  })();

  const reportError = useCallback(
    (error: unknown) => {
      notify.error({
        title: t['com.affine.settings.workspace.storage.local-mirror.failed'](),
        message: (error as Error).message,
      });
    },
    [t]
  );

  const chooseDirectory = useCallback(
    () => void service.selectProjectRoot().catch(reportError),
    [reportError, service]
  );

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
        title:
          t[
            'com.affine.settings.workspace.storage.local-mirror.enable.title'
          ](),
        children:
          t[
            'com.affine.settings.workspace.storage.local-mirror.enable.warning'
          ](),
        confirmText:
          t[
            'com.affine.settings.workspace.storage.local-mirror.enable.confirm'
          ](),
        cancelText: t['Cancel'](),
        onConfirm: enable,
        confirmButtonOptions: { variant: 'primary' },
      });
    },
    [enable, openConfirmModal, service, t]
  );

  const useAffineVersion = useCallback(() => {
    openConfirmModal({
      title:
        t[
          'com.affine.settings.workspace.storage.local-mirror.use-affine.title'
        ](),
      children:
        t[
          'com.affine.settings.workspace.storage.local-mirror.use-affine.warning'
        ](),
      confirmText:
        t[
          'com.affine.settings.workspace.storage.local-mirror.use-affine.confirm'
        ](),
      cancelText: t['Cancel'](),
      onConfirm: () => service.replaceLocalChanges(),
      confirmButtonOptions: { variant: 'error' },
    });
  }, [openConfirmModal, service, t]);

  const retry = useCallback(() => {
    try {
      service.syncNow();
    } catch (error) {
      reportError(error);
    }
  }, [reportError, service]);

  const showUseAffineVersion = canUseAffineVersion(status);
  const showRetry = canRetryLocalMirror(status);

  const mirrorPath = config.projectRoot
    ? `${config.projectRoot.replace(/[\\/]$/, '')}/.affine`
    : t[
        'com.affine.settings.workspace.storage.local-mirror.no-project-directory'
      ]();

  return (
    <>
      <SettingRow
        name={t['com.affine.settings.workspace.storage.local-mirror.name']()}
        desc={t[
          'com.affine.settings.workspace.storage.local-mirror.description'
        ]()}
      >
        <Switch
          aria-label={t[
            'com.affine.settings.workspace.storage.local-mirror.name'
          ]()}
          checked={config.enabled}
          onChange={toggle}
          data-testid="local-workspace-mirror-enabled"
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.workspace.storage.local-mirror.project-directory'
        ]()}
        desc={mirrorPath}
      >
        <Button onClick={chooseDirectory}>
          {t[
            'com.affine.settings.workspace.storage.local-mirror.choose-folder'
          ]()}
        </Button>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.workspace.storage.local-mirror.status']()}
        desc={statusText}
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button disabled={!config.enabled} onClick={retry}>
            {t[
              showRetry
                ? 'com.affine.settings.workspace.storage.local-mirror.retry'
                : 'com.affine.settings.workspace.storage.local-mirror.sync-now'
            ]()}
          </Button>
          <Button
            disabled={!config.projectRoot}
            onClick={() => {
              service.revealMirror().catch(reportError);
            }}
          >
            {t[
              'com.affine.settings.workspace.storage.local-mirror.open-folder'
            ]()}
          </Button>
          {showUseAffineVersion ? (
            <Button variant="error" onClick={useAffineVersion}>
              {t[
                'com.affine.settings.workspace.storage.local-mirror.use-affine.confirm'
              ]()}
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
        {statusText}
      </div>
    </>
  );
};
