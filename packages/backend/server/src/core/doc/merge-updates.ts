import { setImmediate } from 'node:timers/promises';

import type { Logger } from '@nestjs/common';
import { chunk } from 'lodash-es';
import * as Y from 'yjs';
import { mergeUpdates as yjsMergeUpdatesInCore } from 'yjs';

import { metrics } from '../../base';
import { mergeUpdatesInApplyWay as nativeMergeUpdatesInApplyWay } from '../../native';

const SLOW_DOC_UPDATE_CODEC_MS = 250;

type CodecEngine = 'native' | 'yjs';
type MetricStatus = 'ok' | 'error';
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
      const doc = new Y.Doc();
      try {
        for (const batch of chunk(updates, 10)) {
          Y.transact(doc, () => {
            for (const update of batch) Y.applyUpdate(doc, update);
          });
          await setImmediate();
        }
        return Buffer.from(Y.encodeStateAsUpdate(doc));
      } finally {
        doc.destroy();
      }
    }
  );
}
