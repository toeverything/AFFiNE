import webpack from 'webpack';

import { getCwdFromDistribution } from '../config/cwd.cjs';
import type { BuildFlags } from '../config/index.js';
import { buildI18N } from '../util/i18n.js';
import { createWebpackConfig } from '../webpack/webpack.config.js';

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const buildType = process.env.BUILD_TYPE_OVERRIDE || process.env.BUILD_TYPE;

if (process.env.BUILD_TYPE_OVERRIDE) {
  process.env.BUILD_TYPE = process.env.BUILD_TYPE_OVERRIDE;
}

const getChannel = () => {
  switch (buildType) {
    case 'canary':
    case 'beta':
    case 'stable':
    case 'internal':
      return buildType;
    case '':
      throw new Error('BUILD_TYPE is not set');
    default: {
      throw new Error(
        `BUILD_TYPE must be one of canary, beta, stable, internal, received [${buildType}]`
      );
    }
  }
};

let entry: BuildFlags['entry'];

const { DISTRIBUTION } = process.env;

const cwd = getCwdFromDistribution(DISTRIBUTION);

if (DISTRIBUTION === 'desktop') {
  entry = { app: './index.tsx', shell: './shell/index.tsx' };
}

const flags = {
  distribution: DISTRIBUTION as BuildFlags['distribution'],
  mode: 'production',
  channel: getChannel(),
  coverage: process.env.COVERAGE === 'true',
  entry,
} satisfies BuildFlags;

buildI18N();

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
webpack(createWebpackConfig(cwd!, flags), (err, stats) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  if (stats?.hasErrors()) {
    console.error(stats.toString('errors-only'));
    process.exit(1);
  }
});
