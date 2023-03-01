import getConfig from 'next/config';

import { PublicRuntimeConfig, publicRuntimeConfigSchema } from '../types';

const { publicRuntimeConfig: config } = getConfig() as {
  publicRuntimeConfig: PublicRuntimeConfig;
};

publicRuntimeConfigSchema.parse(config);

const printBuildInfo = () => {
  console.group('Build info');
  console.log('Project:', config.PROJECT_NAME);
  console.log(
    'Build date:',
    config.BUILD_DATE ? new Date(config.BUILD_DATE).toLocaleString() : 'Unknown'
  );
  console.log('Editor Version:', config.editorVersion);

  console.log('Version:', config.gitVersion);
  console.log(
    'AFFiNE is an open source project, you can view its source code on GitHub!'
  );
  console.log(`https://github.com/toeverything/AFFiNE/tree/${config.hash}`);
  console.groupEnd();
};

function setWindowEditorVersion() {
  // @ts-ignore
  globalThis.__editoVersion = config.editorVersion;
}

declare global {
  // eslint-disable-next-line no-var
  var __affineSetupEnv: boolean | undefined;
}

if (typeof window !== 'undefined' && !globalThis.__affineSetupEnv) {
  printBuildInfo();
  setWindowEditorVersion();
  globalThis.__affineSetupEnv = true;
}

export { config };
