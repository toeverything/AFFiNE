import type { Server } from '@affine/core/modules/cloud';
import {
  isSupportedServerVersion,
  MIN_SUPPORTED_SERVER_VERSION,
} from '@affine/core/modules/cloud/stores/server-config';
import { useI18n } from '@affine/i18n';
import { useLiveData } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';

const rules = [
  {
    min: MIN_SUPPORTED_SERVER_VERSION,
    tip: (message: string) => (
      <div>
        <p
          style={{
            color: cssVarV2('status/error'),
            fontSize: 14,
            lineHeight: '22px',
          }}
        >
          {message}
        </p>
        <a
          href="https://docs.affine.pro/self-host-affine/install/upgrade"
          target="_blank"
          rel="noreferrer"
          style={{
            color: cssVarV2.text.primary,
            wordBreak: 'break-all',
            fontSize: 12,
            lineHeight: '16px',
          }}
        >
          https://docs.affine.pro/self-host-affine/install/upgrade
        </a>
      </div>
    ),
  },
];

/**
 * Return the error tip if the server version is not meet the requirement
 */
export const useSelfhostLoginVersionGuard = (server: Server) => {
  const t = useI18n();
  const serverVersion =
    useLiveData(server.config$.selector(c => c.version)) ?? '0.0.0';

  for (const rule of rules) {
    if (!isSupportedServerVersion(serverVersion)) {
      return rule.tip(
        t['error.UNSUPPORTED_SERVER_VERSION']({
          requiredVersion: `>=${rule.min}`,
        })
      );
    }
  }

  return null;
};
