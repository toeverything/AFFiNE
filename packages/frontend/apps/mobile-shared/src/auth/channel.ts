import type { AuthRequestProvider } from './request';

type AuthOperation = 'get-valid' | 'refresh';

type AuthRequest = {
  id: string;
  operation: AuthOperation;
  endpoint: string;
};

type AuthResponse = {
  id: string;
  token?: string | null;
  error?: string;
};

const terminalAuthErrors = new Set([
  'ACCESS_TOKEN_INVALID',
  'AUTH_SESSION_EXPIRED',
  'AUTH_SESSION_REVOKED',
  'REFRESH_TOKEN_INVALID',
  'REFRESH_TOKEN_REUSED',
  'UNSUPPORTED_CLIENT_VERSION',
  'AUTH_SESSION_EMPTY',
]);

const temporaryAuthError = 'AUTH_SESSION_TEMPORARILY_UNAVAILABLE';

function errorCode(error: unknown) {
  return typeof error === 'object' &&
    error &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : temporaryAuthError;
}

export function serveAuthRequests(
  port: MessagePort,
  provider: AuthRequestProvider
) {
  port.addEventListener('message', event => {
    const { id, operation, endpoint } = event.data as Partial<AuthRequest>;
    if (
      !id ||
      (operation !== 'get-valid' && operation !== 'refresh') ||
      !endpoint
    ) {
      return;
    }

    const request =
      operation === 'refresh'
        ? provider.refreshAccessToken(endpoint)
        : provider.getValidAccessToken(endpoint);
    request.then(
      token => port.postMessage({ id, token } satisfies AuthResponse),
      error =>
        port.postMessage({
          id,
          error: errorCode(error),
        } satisfies AuthResponse)
    );
  });
  port.start();
}

export class MessagePortAuthProvider implements AuthRequestProvider {
  private port?: MessagePort;
  private nextRequestId = 0;
  private readonly pending = new Map<
    string,
    {
      resolve: (token: string | null) => void;
      reject: (error: Error) => void;
    }
  >();

  setPort(port: MessagePort) {
    this.port = port;
    port.addEventListener('message', event => {
      const { id, token, error } = event.data as Partial<AuthResponse>;
      if (!id) return;
      const pending = this.pending.get(id);
      if (!pending) return;

      if (error) {
        pending.reject(new Error(error));
      } else {
        pending.resolve(token ?? null);
      }
      this.pending.delete(id);
    });
    port.start();
  }

  async getValidAccessToken(endpoint: string) {
    try {
      return await this.request('get-valid', endpoint);
    } catch (error) {
      if (error instanceof Error && terminalAuthErrors.has(error.message)) {
        return null;
      }
      throw error;
    }
  }

  async refreshAccessToken(endpoint: string) {
    const token = await this.request('refresh', endpoint);
    if (!token) throw new Error(temporaryAuthError);
    return token;
  }

  private request(operation: AuthOperation, endpoint: string) {
    const port = this.port;
    if (!port) return Promise.reject(new Error(temporaryAuthError));

    const id = String(++this.nextRequestId);
    return new Promise<string | null>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(temporaryAuthError));
      }, 5000);
      this.pending.set(id, {
        resolve: token => {
          clearTimeout(timeout);
          resolve(token);
        },
        reject: error => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      port.postMessage({ id, operation, endpoint } satisfies AuthRequest);
    });
  }
}
