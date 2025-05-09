import { describe, expect, test } from 'vitest';

import { AsyncLock } from '../async-lock';

describe('AsyncLock', () => {
  test('should acquire and release lock', async () => {
    const lock = new AsyncLock();
    const lock1 = await lock.acquire();
    lock1.release();
  });

  test('should wait for previous lock to be released', async () => {
    const lock = new AsyncLock();
    const order: number[] = [];

    const task1 = async () => {
      const lock1 = await lock.acquire();
      order.push(1);
      await new Promise(resolve => setTimeout(resolve, 10));
      order.push(2);
      lock1.release();
    };

    const task2 = async () => {
      const lock2 = await lock.acquire();
      order.push(3);
      lock2.release();
    };

    await Promise.all([task1(), task2()]);
    expect(order).toEqual([1, 2, 3]);
  });

  test('should work with using statement', async () => {
    const lock = new AsyncLock();
    const order: number[] = [];

    const task1 = async () => {
      using _lock1 = await lock.acquire();
      order.push(1);
      await new Promise(resolve => setTimeout(resolve, 10));
      order.push(2);
    };

    const task2 = async () => {
      using _lock2 = await lock.acquire();
      order.push(3);
    };

    await Promise.all([task1(), task2()]);
    expect(order).toEqual([1, 2, 3]);
  });

  test('should handle multiple concurrent locks', async () => {
    const lock = new AsyncLock();
    const results: number[] = [];

    const createTask = (id: number, delay: number) => async () => {
      using _lockHandle = await lock.acquire();
      results.push(id);
      await new Promise(resolve => setTimeout(resolve, delay));
    };

    await Promise.all([
      createTask(1, 20)(),
      createTask(2, 10)(),
      createTask(3, 5)(),
    ]);

    expect(results).toEqual([1, 2, 3]);
  });

  test('should properly block after a release', async () => {
    const lock = new AsyncLock();
    const order: number[] = [];

    // First acquisition
    const lock1 = await lock.acquire();
    order.push(1);
    lock1.release();

    // These two should be properly serialized
    const task1 = async () => {
      const lock2 = await lock.acquire();
      order.push(2);
      await new Promise(resolve => setTimeout(resolve, 10));
      order.push(3);
      lock2.release();
    };

    const task2 = async () => {
      const lock3 = await lock.acquire();
      order.push(4);
      lock3.release();
    };

    await Promise.all([task1(), task2()]);
    expect(order).toEqual([1, 2, 3, 4]); // This might fail due to the bug
  });

  test('should prevent multiple releases', async () => {
    const lock = new AsyncLock();
    const handle = await lock.acquire();
    handle.release();

    // This second release should either throw or be a no-op
    handle.release();

    // The lock should still be usable
    const handle2 = await lock.acquire();
    handle2.release();
  });
});
