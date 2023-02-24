export default function getConfig() {
  return {
    publicRuntimeConfig: {
      serverAPI: 'http://localhost:3000/api',
      enableIndexedDBProvider: true,
      editorVersion: 'UNKNOWN',
      prefetchWorkspace: false,
    },
  };
}
