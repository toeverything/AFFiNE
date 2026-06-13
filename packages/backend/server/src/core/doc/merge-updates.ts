import type { Logger } from '@nestjs/common';
import { chunk } from 'lodash-es';
import * as Y from 'yjs';
import { mergeUpdates as yjsMergeUpdatesInCore } from 'yjs';

import { metrics } from '../../base';
import { mergeUpdatesInApplyWay as nativeMergeUpdatesInApplyWay } from '../../native';

const SLOW_DOC_UPDATE_CODEC_MS = 250;

type CodecEngine = 'native' | 'yjs';
type MetricStatus = 'ok' | 'error' | 'partial_error';
type CodecLogger = Pick<Logger, 'warn' | 'error'>;

function recordCodecMetrics(
  operation: 'apply_updates' | 'merge_updates',
  engine: CodecEngine,
  caller: string,
  status: MetricStatus,
  duration: number
) {
  metrics.doc.histogram(`${operation}_duration`).record(duration, {
    engine,
    caller,
    status,
  });
  metrics.doc.counter(`${operation}_calls`).add(1, {
    engine,
    caller,
    status,
  });
}

function warnSlowCodecOperation(
  operation: 'apply_updates' | 'merge_updates',
  engine: CodecEngine,
  caller: string,
  duration: number,
  updateCount: number,
  logger?: Pick<Logger, 'warn'>
) {
  if (duration < SLOW_DOC_UPDATE_CODEC_MS) {
    return;
  }

  metrics.doc.counter(`${operation}_slow`).add(1, {
    engine,
    caller,
  });
  logger?.warn(
    `Slow ${engine} ${operation} call in ${caller}: ${duration.toFixed(1)}ms for ${updateCount} updates`
  );
}

function measureSyncCodecOperation<T>(
  operation: 'merge_updates',
  engine: CodecEngine,
  updates: Uint8Array[],
  caller: string,
  logger: Pick<Logger, 'warn'> | undefined,
  fn: () => T
): T {
  const start = performance.now();

  try {
    const result = fn();
    const duration = performance.now() - start;

    recordCodecMetrics(operation, engine, caller, 'ok', duration);
    warnSlowCodecOperation(
      operation,
      engine,
      caller,
      duration,
      updates.length,
      logger
    );

    return result;
  } catch (error) {
    const duration = performance.now() - start;

    recordCodecMetrics(operation, engine, caller, 'error', duration);
    throw error;
  }
}

async function measureAsyncCodecOperation<T>(
  operation: 'merge_updates',
  engine: CodecEngine,
  updates: Uint8Array[],
  caller: string,
  logger: Pick<Logger, 'warn'> | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const start = performance.now();

  try {
    const result = await fn();
    const duration = performance.now() - start;

    recordCodecMetrics(operation, engine, caller, 'ok', duration);
    warnSlowCodecOperation(
      operation,
      engine,
      caller,
      duration,
      updates.length,
      logger
    );

    return result;
  } catch (error) {
    const duration = performance.now() - start;

    recordCodecMetrics(operation, engine, caller, 'error', duration);
    throw error;
  }
}

export function applyUpdatesWithNative(
  updates: Uint8Array[],
  caller: string,
  logger?: Pick<Logger, 'warn'>
) {
  return measureSyncCodecOperation(
    'merge_updates',
    'native',
    updates,
    caller,
    logger,
    () => nativeMergeUpdatesInApplyWay(updates.map(Buffer.from))
  );
}

export function mergeUpdatesWithYjs(
  updates: Uint8Array[],
  caller: string,
  logger?: Pick<Logger, 'warn'>
) {
  return measureSyncCodecOperation(
    'merge_updates',
    'yjs',
    updates,
    caller,
    logger,
    () => Buffer.from(yjsMergeUpdatesInCore(updates))
  );
}

async function recoverDocWithYjs(
  updates: Uint8Array[],
  caller: string,
  logger?: CodecLogger
): Promise<Y.Doc> {
  const doc = new Y.Doc();
  const chunks = chunk(updates, 10);
  let i = 0;
  let failedUpdates = 0;
  const start = performance.now();

  try {
    await new Promise<void>(resolve => {
      Y.transact(doc, () => {
        const next = () => {
          const nextUpdates = chunks.at(i++);

          if (nextUpdates?.length) {
            nextUpdates.forEach(update => {
              try {
                Y.applyUpdate(doc, update);
              } catch (error) {
                failedUpdates += 1;
                metrics.doc.counter('apply_update_failures').add(1, {
                  engine: 'yjs',
                  caller,
                });
                logger?.error('Failed to apply update', error);
              }
            });

            // avoid applying too many updates in single round which will take the whole cpu time like dead lock
            setImmediate(() => {
              next();
            });
          } else {
            resolve();
          }
        };

        next();
      });
    });
  } catch (error) {
    const duration = performance.now() - start;

    recordCodecMetrics('apply_updates', 'yjs', caller, 'error', duration);
    throw error;
  }

  const duration = performance.now() - start;
  const status = failedUpdates > 0 ? 'partial_error' : 'ok';

  recordCodecMetrics('apply_updates', 'yjs', caller, status, duration);
  warnSlowCodecOperation(
    'apply_updates',
    'yjs',
    caller,
    duration,
    updates.length,
    logger
  );

  return doc;
}

export async function applyUpdatesWithYjs(
  updates: Uint8Array[],
  caller: string,
  logger?: CodecLogger
) {
  return measureAsyncCodecOperation(
    'merge_updates',
    'yjs',
    updates,
    caller,
    logger,
    async () => {
      const doc = await recoverDocWithYjs(updates, caller, logger);
      return Buffer.from(Y.encodeStateAsUpdate(doc));
    }
  );
}
