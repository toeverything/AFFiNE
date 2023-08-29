import { isDesktop } from '@affine/env/constant';

type Action = 'signUp' | 'changePassword' | 'signIn' | 'signUp';

export function buildCallbackUrl(action: Action) {
  const callbackUrl = `/auth/${action}`;
  const params: string[][] = [];
  if (isDesktop && window.appInfo.schema) {
    params.push(['schema', window.appInfo.schema]);
  }
  const query =
    params.length > 0
      ? '?' + params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
      : '';
  return callbackUrl + query;
}
