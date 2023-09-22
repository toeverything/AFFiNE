import {
  generateRandUTF16Chars,
  SPAN_ID_BYTES,
  TRACE_ID_BYTES,
  traceReporter,
} from '@affine/graphql';
import { refreshRootMetadataAtom } from '@affine/workspace/atom';
import { getCurrentStore } from '@toeverything/infra/atom';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { signIn, signOut } from 'next-auth/react';
import { startTransition } from 'react';

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

export const signInCloud: typeof signIn = async (provider, ...rest) => {
  const traceParams = genTraceParams();
  if (environment.isDesktop) {
    if (provider === 'google') {
      open(
        `${
          runtimeConfig.serverUrlPrefix
        }/desktop-signin?provider=google&callback_url=${buildCallbackUrl(
          '/open-app/signin-redirect'
        )}`,
        '_target'
      );
      return;
    } else {
      const [options, ...tail] = rest;
      const callbackUrl =
        runtimeConfig.serverUrlPrefix +
        (provider === 'email'
          ? '/open-app/signin-redirect'
          : location.pathname);
      return signIn(
        provider,
        {
          ...options,
          callbackUrl: buildCallbackUrl(callbackUrl),
        },
        ...tail
      )
        .then(res => onResolveHandleTrace(res, traceParams))
        .catch(err => onRejectHandleTrace(err, traceParams));
    }
  } else {
    return signIn(provider, ...rest)
      .then(res => onResolveHandleTrace(res, traceParams))
      .catch(err => onRejectHandleTrace(err, traceParams));
  }
};

export const signOutCloud: typeof signOut = async options => {
  const traceParams = genTraceParams();
  return signOut({
    callbackUrl: '/',
    ...options,
  })
    .then(result => {
      if (result) {
        startTransition(() => {
          localStorage.removeItem('last_workspace_id');
          getCurrentStore().set(refreshRootMetadataAtom);
        });
      }
      return onResolveHandleTrace(result, traceParams);
    })
    .catch(err => onRejectHandleTrace(err, traceParams));
};

export function buildCallbackUrl(callbackUrl: string) {
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
