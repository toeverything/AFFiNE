import { session } from 'electron';

const AUTH_TRANSPORT_PARTITION = 'affine-auth-transport';

export function getAuthTransportSession() {
  return session.fromPartition(AUTH_TRANSPORT_PARTITION, { cache: false });
}

export function authFetch(input: string | Request, init?: RequestInit) {
  return getAuthTransportSession().fetch(input, init);
}
