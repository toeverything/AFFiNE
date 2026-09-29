import type { App } from 'electron';
import { describe, expect, it, vi } from 'vitest';

const showMainWindow = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('../../src/main/windows-manager', () => ({ showMainWindow }));

import {
  markdownOpenHandlers,
  setupMarkdownOpen,
} from '../../src/main/markdown-open';
import { MarkdownOpenRequestQueue } from '../../src/main/markdown-open-queue';

describe('MarkdownOpenRequestQueue', () => {
  it('accepts absolute markdown paths and rejects unsupported paths', () => {
    const queue = new MarkdownOpenRequestQueue();

    expect(queue.enqueue('/tmp/notes/Plan.md')).toMatchObject({
      filePath: '/tmp/notes/Plan.md',
    });
    expect(queue.enqueue('/tmp/notes/Plan.markdown')).toMatchObject({
      filePath: '/tmp/notes/Plan.markdown',
    });
    expect(queue.enqueue('/tmp/notes/Plan.txt')).toBeNull();
    expect(queue.enqueue('Plan.md')).toBeNull();
  });

  it('keeps one pending request per normalized file until completion', () => {
    const queue = new MarkdownOpenRequestQueue();
    const first = queue.enqueue('/tmp/notes/../notes/Plan.md');
    const duplicate = queue.enqueue('/tmp/notes/Plan.md');

    expect(duplicate).toEqual(first);
    expect(queue.pending()).toEqual([first]);

    expect(queue.complete(first!.requestId)).toBe(true);
    expect(queue.pending()).toEqual([]);
    expect(queue.complete(first!.requestId)).toBe(false);
  });
});

describe('setupMarkdownOpen', () => {
  it('captures a macOS open-file event before the renderer is ready', async () => {
    const listeners = new Map<string, (...args: any[]) => void>();
    const app = {
      on: vi.fn((event: string, callback: (...args: any[]) => void) => {
        listeners.set(event, callback);
      }),
      whenReady: vi.fn(async () => {}),
    } as unknown as App;
    const event = { preventDefault: vi.fn() };

    setupMarkdownOpen(app);
    listeners.get('open-file')?.(event, '/tmp/finder-open.md');
    await vi.waitFor(() => expect(showMainWindow).toHaveBeenCalled());

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    const pending = await markdownOpenHandlers.getPending({} as never);
    expect(pending).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filePath: '/tmp/finder-open.md' }),
      ])
    );
    expect(() => structuredClone(pending)).not.toThrow();
  });
});
