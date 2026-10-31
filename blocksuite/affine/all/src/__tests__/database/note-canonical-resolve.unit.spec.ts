import { resolveNoteCanonicalStore } from '@blocksuite/affine-block-database-note-property';
import { describe, expect, it, vi } from 'vitest';

// 999.13: after a reload, a Journal Todo row's linked note that lives in an
// earlier day's journal could not be opened ("That note no longer
// exists."): the note's doc exists in the workspace but is not loaded yet,
// and the existence check was synchronous. Recorded on device: refDoc
// exists, loaded=false, block not found. Must load the doc and wait.
function fakeDoc(id: string, blockId: string, loaded: boolean) {
  const doc = {
    id,
    loaded,
    getStore: () => ({
      id,
      getBlock: (bid: string) =>
        doc.loaded && bid === blockId ? { model: {} } : null,
    }),
  };
  return doc;
}

function fakeStd(docs: Record<string, ReturnType<typeof fakeDoc>>) {
  const current = fakeDoc('today', 'todayBlock', true);
  return {
    store: current.getStore(),
    workspace: { getDoc: (id: string) => docs[id] ?? null },
  };
}

describe('resolveNoteCanonicalStore', () => {
  it('loads an unloaded earlier-day doc and waits for the note block, instead of reporting it gone', async () => {
    const earlier = fakeDoc('yesterday', 'note1', false);
    const std = fakeStd({ yesterday: earlier });
    const waitForBlock = vi.fn(async (doc: typeof earlier) => {
      doc.loaded = true;
      return true;
    });
    const store = await resolveNoteCanonicalStore(
      std as never,
      'yesterday',
      'note1',
      { waitForBlock: waitForBlock as never, waitForDoc: vi.fn() as never }
    );
    expect(waitForBlock).toHaveBeenCalledTimes(1);
    expect(store?.getBlock('note1')).toBeTruthy();
  });

  it('resolves immediately when the doc is already loaded (no waiting)', async () => {
    const earlier = fakeDoc('yesterday', 'note1', true);
    const waitForBlock = vi.fn();
    const store = await resolveNoteCanonicalStore(
      fakeStd({ yesterday: earlier }) as never,
      'yesterday',
      'note1',
      { waitForBlock: waitForBlock as never, waitForDoc: vi.fn() as never }
    );
    expect(waitForBlock).not.toHaveBeenCalled();
    expect(store?.getBlock('note1')).toBeTruthy();
  });

  it('returns null when the note really is gone (block never appears)', async () => {
    const earlier = fakeDoc('yesterday', 'other', false);
    const store = await resolveNoteCanonicalStore(
      fakeStd({ yesterday: earlier }) as never,
      'yesterday',
      'note1',
      {
        waitForBlock: (async () => false) as never,
        waitForDoc: vi.fn() as never,
      }
    );
    expect(store).toBeNull();
  });

  it('waits for the doc handle to appear when it is not in the workspace yet', async () => {
    const docs: Record<string, ReturnType<typeof fakeDoc>> = {};
    const std = fakeStd(docs);
    const waitForDoc = vi.fn(async () => {
      docs.yesterday = fakeDoc('yesterday', 'note1', true);
      return true;
    });
    const store = await resolveNoteCanonicalStore(
      std as never,
      'yesterday',
      'note1',
      { waitForBlock: vi.fn() as never, waitForDoc: waitForDoc as never }
    );
    expect(waitForDoc).toHaveBeenCalledTimes(1);
    expect(store?.getBlock('note1')).toBeTruthy();
  });
});
