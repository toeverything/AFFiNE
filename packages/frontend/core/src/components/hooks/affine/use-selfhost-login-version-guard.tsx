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

function normalizeSemverForComparison(version: string): string | null {
  const raw = version.trim();
  const valid = semver.valid(raw, { loose: true });
  if (valid) {
    return valid;
  }

  const [withoutBuildMetadata, buildMetadata] = raw.split('+', 2);
  const prereleaseSeparator = withoutBuildMetadata.indexOf('-');

  if (prereleaseSeparator === -1) {
    return null;
  }

  const release = withoutBuildMetadata.slice(0, prereleaseSeparator);
  const prerelease = withoutBuildMetadata.slice(prereleaseSeparator + 1);

  if (!release || !prerelease) {
    return null;
  }

  const normalizedPrerelease = prerelease
    .split('.')
    .map(segment => {
      if (/^\d+$/.test(segment)) {
        return String(Number.parseInt(segment, 10));
      }
      return segment;
    })
    .join('.');

  return semver.valid(
    `${release}-${normalizedPrerelease}${buildMetadata ? `+${buildMetadata}` : ''}`,
    {
      loose: true,
    }
  );
}

export function isServerVersionBelowRequirement(
  version: string,
  minimumVersion: string
): boolean {
  const normalizedVersion = normalizeSemverForComparison(version);
  const normalizedMinimum = normalizeSemverForComparison(minimumVersion);

  if (!normalizedVersion || !normalizedMinimum) {
    return false;
  }

  return semver.lt(normalizedVersion, normalizedMinimum, {
    loose: true,
  });
}

/**
 * Return the error tip if the server version is not meet the requirement
 */
export const useSelfhostLoginVersionGuard = (server: Server) => {
  const serverVersion =
    useLiveData(server.config$.selector(c => c.version)) ?? '0.0.0';

  for (const rule of rules) {
    if (isServerVersionBelowRequirement(serverVersion, rule.min)) {
      return rule.tip(serverVersion, rule.min);
    }
  }

  return null;
};
