import { notify } from '@affine/component';
import {
  AuthService,
  type DeviceAuthSession,
} from '@affine/core/modules/cloud';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import { SettingGroup } from '../group';
import { RowLayout } from '../row.layout';

export const DevicesGroup = () => {
  const auth = useService(AuthService);
  const [sessions, setSessions] = useState<DeviceAuthSession[]>([]);

  const reload = useCallback(() => {
    void auth
      .listDeviceSessions()
      .then(setSessions)
      .catch(error => {
        notify.error({
          title: 'Failed to load devices',
          message: String(error),
        });
      });
  }, [auth]);

  useEffect(reload, [reload]);

  const revoke = useCallback(
    async (session: DeviceAuthSession) => {
      if (
        !window.confirm(`Sign out ${session.deviceName ?? session.platform}?`)
      ) {
        return;
      }
      try {
        await auth.revokeDeviceSession(session.id, session.current);
        if (!session.current) reload();
      } catch (error) {
        notify.error({
          title: 'Failed to sign out device',
          message: String(error),
        });
      }
    },
    [auth, reload]
  );

  return (
    <SettingGroup title="Devices">
      {sessions.map(session => (
        <RowLayout
          key={session.id}
          label={
            <div>
              <div>{`${session.deviceName ?? session.platform}${session.current ? ' (current)' : ''}`}</div>
              <div>{`Last used ${new Date(session.lastSeenAt).toLocaleString()}`}</div>
            </div>
          }
          onClick={() => void revoke(session)}
        >
          Sign out
        </RowLayout>
      ))}
      {sessions.length > 1 ? (
        <RowLayout
          label="Sign out all devices"
          onClick={() => {
            if (window.confirm('Sign out every device?')) {
              void auth.revokeAllDeviceSessions().catch(error => {
                notify.error({
                  title: 'Failed to sign out devices',
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
