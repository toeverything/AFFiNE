/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, test, vitest } from 'vitest';

import { IndexedDBJobQueue } from '../impl/indexeddb';
import type { JobQueue } from '../queue';

let queue: JobQueue<{
  a: string;
}> = null!;

describe.each([{ name: 'idb', backend: IndexedDBJobQueue }])(
  'impl tests($name)',
  ({ backend }) => {
    beforeEach(async () => {
      queue = new backend();

      await queue.clear();

      vitest.useFakeTimers({
        toFake: ['Date'],
      });
    });

    afterEach(() => {
      vitest.useRealTimers();
    });

    test('basic', async () => {
      await queue.enqueue([
        {
          batchKey: '1',
          payload: { a: 'hello' },
        },
        {
          batchKey: '2',
          payload: { a: 'world' },
        },
      ]);
      const job1 = await queue.accept();
      const job2 = await queue.accept();

      expect([job1!, job2!]).toEqual([
        [
          {
            id: expect.any(String),
            batchKey: '1',
            payload: { a: 'hello' },
          },
        ],
        [
          {
            id: expect.any(String),
            batchKey: '2',
            payload: { a: 'world' },
          },
        ],
      ]);

      const job3 = await queue.accept();
      expect(job3).toBeNull();

      await queue.return(job1!);
      await queue.return(job2!);
    });

    test('batch', async () => {
      await queue.enqueue([
        {
          batchKey: '1',
          payload: { a: 'hello' },
        },
        {
          batchKey: '1',
          payload: { a: 'world' },
        },
      ]);
      const job1 = await queue.accept();

      expect(job1).toEqual(
        expect.arrayContaining([
          {
            id: expect.any(String),
            batchKey: '1',
            payload: { a: 'hello' },
          },
          {
            id: expect.any(String),
            batchKey: '1',
            payload: { a: 'world' },
          },
        ])
      );
    });

    test('timeout', async () => {
      await queue.enqueue([
        {
          batchKey: '1',
          payload: { a: 'hello' },
        },
      ]);
      {
        const job = await queue.accept();

        expect(job).toEqual([
          {
            id: expect.any(String),
            batchKey: '1',
            payload: { a: 'hello' },
          },
        ]);
      }

      {
        const job = await queue.accept();

        expect(job).toBeNull();
      }

      vitest.advanceTimersByTime(1000 * 60 * 60);

      {
        const job = await queue.accept();

        expect(job).toEqual([
          {
            id: expect.any(String),
            batchKey: '1',
            payload: { a: 'hello' },
          },
        ]);
      }
    });

    test('waitForAccept', async () => {
      const abort = new AbortController();

      let result = null as any;
      queue.waitForAccept(abort.signal).then(jobs => (result = jobs));

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(result).toBeNull();

      await queue.enqueue([
        {
          batchKey: '1',
          payload: { a: 'hello' },
        },
      ]);

      await vitest.waitFor(() => {
        expect(result).toEqual([
          {
            id: expect.any(String),
            batchKey: '1',
            payload: { a: 'hello' },
          },
        ]);
      });
    });

    test('waitForAccept race', async () => {
      const abort = new AbortController();

      let result1 = null as any;
      let result2 = null as any;
      queue.waitForAccept(abort.signal).then(jobs => (result1 = jobs));
      queue.waitForAccept(abort.signal).then(jobs => (result2 = jobs));

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(result1).toBeNull();
      expect(result2).toBeNull();

      await queue.enqueue([
        {
          batchKey: '1',
          payload: { a: 'hello' },
        },
      ]);

      await new Promise(resolve => setTimeout(resolve, 100));

      expect([result1, result2]).toEqual(
        expect.arrayContaining([
          [
            {
              id: expect.any(String),
              batchKey: '1',
              payload: { a: 'hello' },
            },
          ],
          null,
        ])
      );

      await queue.enqueue([
        {
          batchKey: '2',
          payload: { a: 'world' },
        },
      ]);

      await vitest.waitFor(() => {
        expect([result1, result2]).toEqual(
          expect.arrayContaining([
            [
              {
                id: expect.any(String),
                batchKey: '1',
                payload: { a: 'hello' },
              },
            ],
            [
              {
                id: expect.any(String),
                batchKey: '2',
                payload: { a: 'world' },
              },
            ],
          ])
        );
      });
    });
  }
);
