import type { Server } from '@affine/core/modules/cloud';
import { useLiveData } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import semver from 'semver';

const rules = [
  {
    min: '0.23.0',
    tip: (receivedVersion: string, requiredVersion: string) => (
      <div>
        <p
          style={{
            color: cssVarV2('status/error'),
            fontSize: 14,
            lineHeight: '22px',
          }}
        >
          Your server version{' '}
          <b style={{ fontWeight: 600 }}>{receivedVersion}</b> is not compatible
          with current client. Please upgrade your server to{' '}
          <b style={{ fontWeight: 600 }}>{requiredVersion}</b> or higher to use
          this client.
        </p>
        <div style={{ marginTop: '12px', color: cssVarV2.text.primary }}>
          <span style={{ fontWeight: 500 }}>Instructions:</span>
          <br />
          <a
            style={{
              whiteSpace: 'break-spaces',
              wordBreak: 'break-all',
              fontSize: 12,
              lineHeight: '16px',
            }}
          >
            https://docs.affine.pro/self-host-affine/install/upgrade
          </a>
        </div>
      </div>
    ),
  },
];

/**
 * Return the error tip if the server version is not meet the requirement
 */
export const useSelfhostLoginVersionGuard = (server: Server) => {
  const serverVersion =
    useLiveData(server.config$.selector(c => c.version)) ?? '0.0.0';

  for (const rule of rules) {
    if (semver.lt(serverVersion, rule.min)) {
      return rule.tip(serverVersion, rule.min);
    }
  }

  return null;
};
