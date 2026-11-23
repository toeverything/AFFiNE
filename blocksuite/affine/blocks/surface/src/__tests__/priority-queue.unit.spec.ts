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

  it('should not sink a node past children that are all larger than it', () => {
    // While sinking `4`, `bubbleDown` reaches a node whose children are
    // `[7, 6]`. The right child is smaller than the left one, but both are
    // larger than `4`, so the node must stay where it is.
    const pq = new PriorityQueue<number, number>((a, b) => a - b);
    [1, 2, 3, 7, 6, 5, 4].forEach(priority => pq.enqueue(priority, priority));

    const dequeued: number[] = [];
    while (!pq.empty()) {
      dequeued.push(pq.dequeue() as number);
    }

    expect(dequeued).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('should dequeue in ascending order regardless of insertion order', () => {
    const input = [11, 63, 91, 7, 38, 67, 8, 13, 29];
    const pq = new PriorityQueue<number, number>((a, b) => a - b);
    input.forEach(priority => pq.enqueue(priority, priority));

    const dequeued: number[] = [];
    while (!pq.empty()) {
      dequeued.push(pq.dequeue() as number);
    }

    expect(dequeued).toEqual([...input].sort((a, b) => a - b));
  });
});
