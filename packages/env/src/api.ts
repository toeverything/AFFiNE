import { config, env } from './config';
import { isValidIPAddress } from './is-valid-ip-address';

let prefixUrl = '/';
if (typeof window === 'undefined' || env.isDesktop) {
  // SSR or Desktop
  const serverAPI = config.serverAPI;
  if (isValidIPAddress(serverAPI.split(':')[0])) {
    // This is for Server side rendering support
    prefixUrl = new URL('http://' + config.serverAPI + '/').origin;
  } else {
    prefixUrl = serverAPI;
  }
  prefixUrl = prefixUrl.endsWith('/') ? prefixUrl : prefixUrl + '/';
} else {
  const params = new URLSearchParams(window.location.search);
  if (params.get('prefixUrl')) {
    prefixUrl = params.get('prefixUrl') as string;
  } else {
    prefixUrl = window.location.origin + '/';
  }
}

const apiUrl = new URL(prefixUrl);
const wsProtocol = apiUrl.protocol === 'https:' ? 'wss' : 'ws';
const websocketPrefixUrl = `${wsProtocol}://${apiUrl.host}`;

export { prefixUrl, websocketPrefixUrl };
