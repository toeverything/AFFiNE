export function popupWindow(target: string) {
  const url = new URL(runtimeConfig.serverUrlPrefix + '/redirect-proxy');
  target = /^https?:\/\//.test(target)
    ? target
    : runtimeConfig.serverUrlPrefix + target;
  url.searchParams.set('redirect_uri', target);
  return window.open(url, '_blank', `noreferrer noopener`);
}
