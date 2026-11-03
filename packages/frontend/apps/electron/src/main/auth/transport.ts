import { AuthSessionError } from '@affine/auth';
import { session } from 'electron';

const AUTH_TRANSPORT_PARTITION = 'affine-auth-transport';

export function getAuthTransportSession() {
  return session.fromPartition(AUTH_TRANSPORT_PARTITION, { cache: false });
}

export async function authFetch(input: string | Request, init?: RequestInit) {
  try {
    return await getAuthTransportSession().fetch(input, init);
  } catch {
    throw new AuthSessionError(
      init?.signal?.aborted ? 'AUTH_REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      true
    );
  }
}
