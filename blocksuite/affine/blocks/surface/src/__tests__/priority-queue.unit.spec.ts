import { describe, expect, it } from 'vitest';

import { PriorityQueue } from '../utils/priority-queue.js';

describe('priority queue', () => {
  it('should dequeue the smallest item', () => {
    const pq = new PriorityQueue<string, number>((a, b) => a - b);
    pq.enqueue('d', 4);
    pq.enqueue('c', 3);
    expect(pq.dequeue()).toBe('c');

    pq.enqueue('b', 2);
    pq.enqueue('a', 1);
    expect(pq.dequeue()).toBe('a');
    expect(pq.dequeue()).toBe('b');

    pq.enqueue('e', 5);
    expect(pq.dequeue()).toBe('d');
    expect(pq.dequeue()).toBe('e');
    expect(pq.dequeue()).toBe(null);
  });
});
