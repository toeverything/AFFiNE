export function getWorkerUrl(name: string) {
  return (
    environment.workerPath + `${name}-${BUILD_CONFIG.appVersion}.worker.js`
  );
}
