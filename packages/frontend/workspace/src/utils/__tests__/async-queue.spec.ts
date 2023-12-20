import { describe, expect, test, vi } from 'vitest';

import { AsyncQueue } from '../async-queue';

describe('async-queue', () => {
  test('push & pop', async () => {
    const queue = new AsyncQueue();
    queue.push(1, 2, 3);
    expect(queue.length).toBe(3);
    expect(await queue.next()).toBe(1);
    expect(await queue.next()).toBe(2);
    expect(await queue.next()).toBe(3);
    expect(queue.length).toBe(0);
  });

  test('await', async () => {
    const queue = new AsyncQueue<number>();
    queue.push(1, 2);
    expect(await queue.next()).toBe(1);
    expect(await queue.next()).toBe(2);

    let v = -1;

    // setup 2 pop tasks
    queue.next().then(next => {
      v = next;
    });
    queue.next().then(next => {
      v = next;
    });

    // Wait for 100ms
    await new Promise(resolve => setTimeout(resolve, 100));
    // v should not be changed
    expect(v).toBe(-1);

    // push 3, should trigger the first pop task
    queue.push(3);
    await vi.waitFor(() => v === 3);

    // push 4, should trigger the second pop task
    queue.push(4);
    await vi.waitFor(() => v === 4);
  });
});
