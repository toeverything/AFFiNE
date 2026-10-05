import { notify } from '@affine/component';
import {
  AuthService,
  type DeviceAuthSession,
} from '@affine/core/modules/cloud';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useRef, useState } from 'react';

import { SettingGroup } from '../group';
import { RowLayout } from '../row.layout';

const loadFailedToastId = 'mobile-settings-devices-load-failed';

export const DevicesGroup = () => {
  const t = useI18n();
  const auth = useService(AuthService);
  const loginStatus = useLiveData(auth.session.status$);
  const [sessions, setSessions] = useState<DeviceAuthSession[]>([]);
  const dismissTimer = useRef<number | undefined>(undefined);

  const reload = useCallback(() => {
    if (loginStatus !== 'authenticated') {
      setSessions([]);
      return;
    }

    void auth
      .listDeviceSessions()
      .then(setSessions)
      .catch(error => {
        const toastId = notify.error(
          {
            title: t['com.affine.settings.devices.load-failed'](),
            message: String(error),
          },
          { id: loadFailedToastId, duration: 5000 }
        );
        window.clearTimeout(dismissTimer.current);
        dismissTimer.current = window.setTimeout(
          () => notify.dismiss(toastId),
          5000
        );
      });
  }, [auth, loginStatus, t]);

  useEffect(reload, [reload]);
  useEffect(
    () => () => {
      window.clearTimeout(dismissTimer.current);
      notify.dismiss(loadFailedToastId);
    },
    []
  );

  const revoke = useCallback(
    async (session: DeviceAuthSession) => {
      if (
        !window.confirm(
          t['com.affine.settings.devices.confirm']({
            device: session.deviceName ?? session.platform,
          })
        )
      ) {
        return;
      }
      try {
        await auth.revokeDeviceSession(session.id, session.current);
        if (!session.current) reload();
      } catch (error) {
        notify.error({
          title: t['com.affine.settings.devices.sign-out-failed'](),
          message: String(error),
        });
      }
    },
    [auth, reload, t]
  );

  if (loginStatus !== 'authenticated' || sessions.length === 0) {
    return null;
  }

  return (
    <SettingGroup title={t['com.affine.settings.devices.title']()}>
      {sessions.map(session => (
        <RowLayout
          key={session.id}
          label={
            <div>
              <div>{`${session.deviceName ?? session.platform}${session.current ? ` (${t['com.affine.settings.devices.current']()})` : ''}`}</div>
              <div>
                {t['com.affine.settings.devices.last-used']({
                  time: new Date(session.lastSeenAt).toLocaleString(),
                })}
              </div>
            </div>
          }
          onClick={() => void revoke(session)}
        >
          {t['com.affine.settings.devices.sign-out']()}
        </RowLayout>
      ))}
      {sessions.length > 1 ? (
        <RowLayout
          label={t['com.affine.settings.devices.sign-out-all']()}
          onClick={() => {
            if (
              window.confirm(t['com.affine.settings.devices.confirm-all']())
            ) {
              void auth.revokeAllDeviceSessions().catch(error => {
                notify.error({
                  title: t['com.affine.settings.devices.sign-out-all-failed'](),
                  message: String(error),
                });
              });
            }
          }}
        />
      ) : null}
    </SettingGroup>
  );
};
