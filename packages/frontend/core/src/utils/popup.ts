export function popupWindow(target: string) {
  const url = new URL(runtimeConfig.serverUrlPrefix + '/redirect-proxy');
  url.searchParams.set('redirect_uri', target);

  return window.open(url, '_blank', `noreferrer noopener`);
}
