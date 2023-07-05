import {
  blockSuiteFeatureFlags,
  buildFlags,
  // @ts-expect-error
} from '@affine/web/preset.config.mjs';

export default function getConfig() {
  return {
    publicRuntimeConfig: {
      PROJECT_NAME: 'AFFiNE Mock',
      BUILD_DATE: '2021-09-01T00:00:00.000Z',
      gitVersion: 'UNKNOWN',
      hash: 'UNKNOWN',
      editorFlags: blockSuiteFeatureFlags,
      ...buildFlags,
    },
  };
}
