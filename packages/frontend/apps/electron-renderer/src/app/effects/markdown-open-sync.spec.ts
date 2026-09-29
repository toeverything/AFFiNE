import { describe, expect, it, vi } from 'vitest';

import { waitForMarkdownDocumentSync } from './markdown-open-sync';

describe('waitForMarkdownDocumentSync', () => {
  it('waits for the target document before releasing its priority and workspace', async () => {
    const calls: string[] = [];
    let finishSync: (() => void) | undefined;
    const waitForSynced = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finishSync = () => {
            calls.push('synced');
            resolve();
          };
        })
    );
    const undoPriority = vi.fn(() => calls.push('priority-released'));
    const dispose = vi.fn(() => calls.push('workspace-released'));
    const workspace = {
      engine: {
        doc: {
          addPriority: vi.fn(() => {
            calls.push('priority-added');
            return undoPriority;
          }),
          waitForSynced,
        },
      },
    };

    const waiting = waitForMarkdownDocumentSync(
      () => ({ workspace, dispose }),
      'workspace-a',
      'doc-a',
      async () => {},
      async () => {}
    );

    expect(calls).toEqual(['priority-added']);
    await vi.waitFor(() => {
      expect(waitForSynced).toHaveBeenCalledWith(
        'doc-a',
        expect.any(AbortSignal)
      );
    });

    finishSync?.();
    await waiting;

    expect(calls).toEqual([
      'priority-added',
      'synced',
      'priority-released',
      'workspace-released',
    ]);
  });

  it('opens the target document before its background sync completes', async () => {
    let finishSync: (() => void) | undefined;
    const workspace = {
      engine: {
        doc: {
          addPriority: vi.fn(() => vi.fn()),
          waitForSynced: vi.fn(
            () =>
              new Promise<void>(resolve => {
                finishSync = resolve;
              })
          ),
        },
      },
    };
    const navigate = vi.fn(async () => {});

    const syncing = waitForMarkdownDocumentSync(
      () => ({ workspace, dispose: vi.fn() }),
      'workspace-a',
      'doc-a',
      async () => {},
      navigate
    );

    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/workspace/workspace-a/doc-a');
    });

    finishSync?.();
    await syncing;
  });

  it('does not open the target route before the document is locally available', async () => {
    let finishAvailability: (() => void) | undefined;
    let finishSync: (() => void) | undefined;
    const workspace = {
      engine: {
        doc: {
          addPriority: vi.fn(() => vi.fn()),
          waitForSynced: vi.fn(
            () =>
              new Promise<void>(resolve => {
                finishSync = resolve;
              })
          ),
        },
      },
    };
    const waitForDocumentAvailable = vi.fn(
      () =>
        new Promise<void>(resolve => {
          finishAvailability = resolve;
        })
    );
    const navigate = vi.fn(async () => {});

    const syncing = waitForMarkdownDocumentSync(
      () => ({ workspace, dispose: vi.fn() }),
      'workspace-a',
      'doc-a',
      waitForDocumentAvailable,
      navigate
    );

    await vi.waitFor(() => {
      expect(waitForDocumentAvailable).toHaveBeenCalledWith(
        workspace,
        'doc-a',
        expect.any(AbortSignal)
      );
    });
    expect(navigate).not.toHaveBeenCalled();

    finishAvailability?.();
    await vi.waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('/workspace/workspace-a/doc-a');
    });

    finishSync?.();
    await syncing;
  });
});
