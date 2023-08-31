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

export const signInCloud: typeof signIn = async (...args) => {
  const startTime = new Date().toISOString();
  const spanId = generateRandUTF16Chars(SPAN_ID_BYTES);
  const traceId = generateRandUTF16Chars(TRACE_ID_BYTES);
  const event = 'signInCloud';
  return signIn(...args)
    .then(result => {
      if (traceReporter) {
        traceReporter.cacheTrace(traceId, spanId, startTime, {
          event,
        });
      }
      // do not refresh root metadata,
      // because the session won't change in this callback
      return result;
    })
    .catch(err => {
      if (traceReporter) {
        traceReporter.uploadTrace(traceId, spanId, startTime, {
          event,
        });
      }
      return Promise.reject(err);
    });
};

export const signOutCloud: typeof signOut = async (...args) => {
  const startTime = new Date().toISOString();
  const spanId = generateRandUTF16Chars(SPAN_ID_BYTES);
  const traceId = generateRandUTF16Chars(TRACE_ID_BYTES);
  const event = 'signOutCloud';
  return signOut(...args)
    .then(result => {
      if (traceReporter) {
        traceReporter.cacheTrace(traceId, spanId, startTime, {
          event,
        });
      }
      if (result) {
        startTransition(() => {
          getCurrentStore().set(refreshRootMetadataAtom);
        });
      }
      return result;
    })
    .catch(err => {
      if (traceReporter) {
        traceReporter.uploadTrace(traceId, spanId, startTime, {
          event,
        });
      }
      return Promise.reject(err);
    });
};
