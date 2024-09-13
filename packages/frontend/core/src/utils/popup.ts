export function popupWindow(target: string) {
  const url = new URL(BUILD_CONFIG.serverUrlPrefix + '/redirect-proxy');
  target = /^https?:\/\//.test(target)
    ? target
    : BUILD_CONFIG.serverUrlPrefix + target;
  url.searchParams.set('redirect_uri', target);
  return window.open(url, '_blank', `noreferrer noopener`);
}
