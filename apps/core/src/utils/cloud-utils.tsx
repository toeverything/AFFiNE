import { isDesktop } from '@affine/env/constant';
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

function genTraceParams() {
  const startTime = new Date().toISOString();
  const spanId = generateRandUTF16Chars(SPAN_ID_BYTES);
  const traceId = generateRandUTF16Chars(TRACE_ID_BYTES);
  const event = 'signInCloud';
  return { startTime, spanId, traceId, event };
}

function onResolveHandleTrace<T>(res: Promise<T> | T): Promise<T> | T {
  const { startTime, spanId, traceId, event } = genTraceParams();
  traceReporter &&
    traceReporter.cacheTrace(traceId, spanId, startTime, { event });
  return res;
}

function onRejectHandleTrace<T>(res: Promise<T> | T): Promise<T> {
  const { startTime, spanId, traceId, event } = genTraceParams();
  traceReporter &&
    traceReporter.uploadTrace(traceId, spanId, startTime, { event });
  return Promise.reject(res);
}

function getTraceHandler(success = true) {
  return success ? onResolveHandleTrace : onRejectHandleTrace;
}

export const signInCloud: typeof signIn = async (provider, ...rest) => {
  if (isDesktop) {
    if (provider === 'google') {
      open(
        `${
          runtimeConfig.serverUrlPrefix
        }/desktop-signin?provider=google&callback_url=${buildCallbackUrl(
          '/open-app/oauth-jwt'
        )}`,
        '_target'
      );
      return;
    } else if (provider === 'email') {
      const [options, ...tail] = rest;
      return signIn(
        provider,
        {
          ...options,
          callbackUrl: buildCallbackUrl('/open-app/oauth-jwt'),
        },
        ...tail
      )
        .then(getTraceHandler(true))
        .catch(getTraceHandler(false));
    } else {
      throw new Error('Unsupported provider');
    }
  } else {
    return signIn(provider, ...rest)
      .then(getTraceHandler(true))
      .catch(getTraceHandler(false));
  }
};

export const signOutCloud: typeof signOut = async (...args) => {
  return signOut(...args)
    .then(result => {
      if (result) {
        startTransition(() => {
          getCurrentStore().set(refreshRootMetadataAtom);
        });
      }
      return getTraceHandler(true)(result);
    })
    .catch(getTraceHandler(false));
};

export function buildCallbackUrl(callbackUrl: string) {
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
