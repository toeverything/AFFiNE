import { Button, notify, Switch, useConfirmModal } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { LocalMirrorService } from '@affine/core/modules/local-mirror';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback } from 'react';

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
        return t[
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

  const replace = useCallback(() => {
    openConfirmModal({
      title:
        t['com.affine.settings.workspace.storage.local-mirror.replace.title'](),
      children:
        t[
          'com.affine.settings.workspace.storage.local-mirror.replace.warning'
        ](),
      confirmText:
        t[
          'com.affine.settings.workspace.storage.local-mirror.replace.confirm'
        ](),
      cancelText: t['Cancel'](),
      onConfirm: () => service.replaceLocalChanges(),
      confirmButtonOptions: { variant: 'error' },
    });
  }, [openConfirmModal, service, t]);

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
        <Button
          onClick={() => {
            chooseDirectory().catch(reportError);
          }}
        >
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
          <Button disabled={!config.enabled} onClick={() => service.syncNow()}>
            {t['com.affine.settings.workspace.storage.local-mirror.sync-now']()}
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
          {status.type === 'conflict' ? (
            <Button variant="error" onClick={replace}>
              {t[
                'com.affine.settings.workspace.storage.local-mirror.replace.confirm'
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
