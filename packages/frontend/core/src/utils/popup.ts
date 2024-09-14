export function popupWindow(target: string) {
  target = /^https?:\/\//.test(target)
    ? target
    : BUILD_CONFIG.serverUrlPrefix + target;
  const targetUrl = new URL(target);

  let url: string;
  // safe to open directly if in the same origin
  if (targetUrl.origin === location.origin) {
    url = target;
  } else {
    const builder = new URL(BUILD_CONFIG.serverUrlPrefix + '/redirect-proxy');
    builder.searchParams.set('redirect_uri', target);
    url = builder.toString();
  }

  return window.open(url, '_blank', `noreferrer noopener`);
}
