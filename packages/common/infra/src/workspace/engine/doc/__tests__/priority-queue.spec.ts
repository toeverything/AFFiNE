import { describe, expect, test } from 'vitest';

import { PriorityQueue } from '../priority-queue';

describe('Priority Queue', () => {
  test('priority', () => {
    const queue = new PriorityQueue();

    queue.push('foo', 1);
    queue.push('bar', 2);
    queue.push('baz', 0);

    expect(queue.pop()).toBe('bar');
    expect(queue.pop()).toBe('foo');
    expect(queue.pop()).toBe('baz');
    expect(queue.pop()).toBe(null);

    queue.push('B', 1);
    queue.push('A', 1);

    // if priority same then follow id binary order
    expect(queue.pop()).toBe('B');
    expect(queue.pop()).toBe('A');
    expect(queue.pop()).toBe(null);

    queue.push('A', 1);
    queue.push('B', 2);
    queue.push('A', 3); // same id but different priority, update the priority

    expect(queue.pop()).toBe('A');
    expect(queue.pop()).toBe('B');
    expect(queue.pop()).toBe(null);

    queue.push('A', 1);
    queue.push('B', 2);
    queue.remove('B');

    expect(queue.pop()).toBe('A');
    expect(queue.pop()).toBe(null);
  });
});
