export function getWorkerUrl(name: string) {
  return (
    // NOTE: worker can not use publicPath because it must obey the same-origin policy
    (environment.subPath || '/') +
    'js/' +
    `${name}-${BUILD_CONFIG.appVersion}.worker.js`
  );
}
