export default function getConfig() {
  return {
    publicRuntimeConfig: {
      PROJECT_NAME: 'AFFiNE Mock',
      BUILD_DATE: '2021-09-01T00:00:00.000Z',
      gitVersion: 'UNKNOWN',
      hash: 'UNKNOWN',
      editorVersion: 'UNKNOWN',
      serverAPI: 'http://localhost:3000/api',
      enableBroadCastChannelProvider: true,
      enableIndexedDBProvider: true,
      prefetchWorkspace: false,
      exposeInternal: true,
      enableSubpage: true,
    },
  };
}
