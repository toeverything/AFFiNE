import {
  generateRandUTF16Chars,
  getBaseUrl,
  OAuthProviderType,
  SPAN_ID_BYTES,
  TRACE_ID_BYTES,
  traceReporter,
} from '@affine/graphql';
import { CLOUD_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY } from '@affine/workspace-impl';

type TraceParams = {
  startTime: string;
  spanId: string;
  traceId: string;
  event: string;
};

function genTraceParams(): TraceParams {
  const startTime = new Date().toISOString();
  const spanId = generateRandUTF16Chars(SPAN_ID_BYTES);
  const traceId = generateRandUTF16Chars(TRACE_ID_BYTES);
  const event = 'signInCloud';
  return { startTime, spanId, traceId, event };
}

function onResolveHandleTrace<T>(
  res: Promise<T> | T,
  params: TraceParams
): Promise<T> | T {
  const { startTime, spanId, traceId, event } = params;
  traceReporter &&
    traceReporter.cacheTrace(traceId, spanId, startTime, { event });
  return res;
}

function onRejectHandleTrace<T>(
  res: Promise<T> | T,
  params: TraceParams
): Promise<T> {
  const { startTime, spanId, traceId, event } = params;
  traceReporter &&
    traceReporter.uploadTrace(traceId, spanId, startTime, { event });
  return Promise.reject(res);
}

type Providers = 'credentials' | 'email' | OAuthProviderType;

export const signInCloud = async (
  provider: Providers,
  credentials?: { email: string; password?: string },
  searchParams: Record<string, any> = {}
): Promise<Response | undefined> => {
  const traceParams = genTraceParams();

  if (provider === 'credentials' || provider === 'email') {
    if (!credentials) {
      throw new Error('Invalid Credentials');
    }

    return signIn(credentials, searchParams)
      .then(res => onResolveHandleTrace(res, traceParams))
      .catch(err => onRejectHandleTrace(err, traceParams));
  } else if (OAuthProviderType[provider]) {
    if (environment.isDesktop) {
      open(
        `${
          runtimeConfig.serverUrlPrefix
        }/desktop-signin?provider=${provider}&redirect_uri=${buildRedirectUri(
          '/open-app/signin-redirect'
        )}`,
        '_target'
      );
    } else {
      location.href = `${
        runtimeConfig.serverUrlPrefix
      }/oauth/login?provider=${provider}&redirect_uri=${encodeURIComponent(
        searchParams.redirectUri ?? location.pathname
      )}`;
    }

    return;
  } else {
    throw new Error('Invalid Provider');
  }
};

async function signIn(
  credential: { email: string; password?: string },
  searchParams: Record<string, any> = {}
) {
  const url = new URL(getBaseUrl() + '/api/auth/sign-in');

  for (const key in searchParams) {
    url.searchParams.set(key, searchParams[key]);
  }

  const redirectUri =
    runtimeConfig.serverUrlPrefix +
    (environment.isDesktop
      ? buildRedirectUri('/open-app/signin-redirect')
      : location.pathname);

  url.searchParams.set('redirect_uri', redirectUri);

  return fetch(url.toString(), {
    method: 'POST',
    body: JSON.stringify(credential),
    headers: {
      'content-type': 'application/json',
    },
  });
}

export const signOutCloud = async (redirectUri?: string) => {
  const traceParams = genTraceParams();
  return fetch(getBaseUrl() + '/api/auth/sign-out')
    .then(result => {
      if (result.ok) {
        new BroadcastChannel(
          CLOUD_WORKSPACE_CHANGED_BROADCAST_CHANNEL_KEY
        ).postMessage(1);

        if (redirectUri && location.href !== redirectUri) {
          setTimeout(() => {
            location.href = redirectUri;
          }, 0);
        }
      }
      return onResolveHandleTrace(result, traceParams);
    })
    .catch(err => onRejectHandleTrace(err, traceParams));
};

export function buildRedirectUri(callbackUrl: string) {
  const params: string[][] = [];
  if (environment.isDesktop && window.appInfo.schema) {
    params.push(['schema', window.appInfo.schema]);
  }
  const query =
    params.length > 0
      ? '?' + params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')
      : '';
  return callbackUrl + query;
}
