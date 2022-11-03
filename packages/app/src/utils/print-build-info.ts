import getConfig from 'next/config';

type Config = {
  BUILD_DATE: string;
  NODE_ENV: string;
  PROJECT_NAME: string;
  VERSION: string;
  CI?: string;
  COMMIT_HASH: string;
};

const nextConfig = getConfig();
const publicRuntimeConfig: Config = nextConfig.publicRuntimeConfig;

const printBuildInfo = () => {
  if (process.env.NODE_ENV === 'development') {
    return;
  }
  console.group('Build info');
  console.log('Project:', publicRuntimeConfig.PROJECT_NAME);
  console.log(
    'Build date:',
    publicRuntimeConfig.BUILD_DATE
      ? new Date(publicRuntimeConfig.BUILD_DATE).toLocaleString()
      : 'Unknown'
  );
  console.log(
    'Environment:',
    `${publicRuntimeConfig.NODE_ENV}${publicRuntimeConfig.CI ? '(ci)' : ''}`
  );
  console.log('Version:', publicRuntimeConfig.VERSION);
  console.log(
    'AFFiNE is an open source project, you can view its source code on GitHub!'
  );
  console.log(
    `https://github.com/toeverything/AFFiNE/tree/${publicRuntimeConfig.COMMIT_HASH}`
  );
  console.groupEnd();
};

printBuildInfo();

export {};
