import type * as BlocksuiteGlobalEnv from '@blocksuite/global/env';
import { expect, test, vi } from 'vitest';
import * as Y from 'yjs';

vi.mock('@blocksuite/global/env', async importOriginal => {
  const actual = await importOriginal<typeof BlocksuiteGlobalEnv>();
  return { ...actual, IS_ANDROID: true };
});

import { effects } from '../../effects.js';
import { InlineEditor } from '../../inline/index.js';

effects();

async function setupInlineEditor(text: string) {
  const yDoc = new Y.Doc();
  const yText = yDoc.getText('text');
  yText.insert(0, text);

  const editor = new InlineEditor(yText);
  const root = document.createElement('div');
  const outside = document.createElement('div');
  outside.textContent = 'outside';

  document.body.append(root, outside);
  editor.mount(root);
  await editor.waitForUpdate();

  return { editor, root, outside };
}

function setNativeSelection(range: Range) {
  const selection = document.getSelection();
  if (!selection) {
    throw new Error('Selection is not available');
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

function clearNativeSelection() {
  const selection = document.getSelection();
  selection?.removeAllRanges();
}

async function teardownInlineEditor(
  ctx: Awaited<ReturnType<typeof setupInlineEditor>>
) {
  clearNativeSelection();
  ctx.editor.unmount();
  ctx.root.remove();
  ctx.outside.remove();
}

// Regression test for https://github.com/toeverything/AFFiNE/issues/12806:
// on Android, committing an IME composition with space used to duplicate the
// composed word because `_isComposing` was cleared before awaiting the
// post-composition rerender, letting the space-commit `beforeinput` race in
// and get processed as ordinary (non-composing) input.
test('compositionend race: a beforeinput arriving mid-await does not duplicate the composed word', async () => {
  const ctx = await setupInlineEditor('');
  try {
    const es = ctx.editor.eventService as any;

    const collapsedRange = ctx.editor.toDomRange({ index: 0, length: 0 });
    expect(collapsedRange).not.toBeNull();
    setNativeSelection(collapsedRange!);

    es._onCompositionStart({ data: '' } as CompositionEvent);
    expect(es.isComposing).toBe(true);

    // A composing keystroke, as the IME builds up "Hi".
    const composingEvent = {
      inputType: 'insertCompositionText',
      data: 'H',
      dataTransfer: null,
      isComposing: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      getTargetRanges: () => [],
    } as unknown as InputEvent;
    await es._onBeforeInput(composingEvent);
    expect(ctx.editor.yTextString).toBe('');

    // Commit the composition ("Hi"), but don't await it yet: an async
    // function runs synchronously up to its first `await`, so this call
    // captures the composition range and suspends at
    // `await this.editor.waitForUpdate()` with `_isComposing` still `true`.
    const compositionEndEvent = {
      data: 'Hi',
      preventDefault: vi.fn(),
    } as unknown as CompositionEvent;
    const compositionEndPromise = es._onCompositionEnd(compositionEndEvent);

    // While still suspended, the browser fires the space-commit `beforeinput`
    // that used to race in and duplicate the word.
    const spaceEvent = {
      inputType: 'insertText',
      data: ' ',
      dataTransfer: null,
      isComposing: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      getTargetRanges: () => [],
    } as unknown as InputEvent;
    await es._onBeforeInput(spaceEvent);

    // Ignored: still treated as composing, so it must not mutate the doc.
    expect(spaceEvent.preventDefault).toHaveBeenCalledOnce();
    expect(ctx.editor.yTextString).toBe('');

    await compositionEndPromise;

    // The composed word lands exactly once (not "HiHi"), and composing state
    // is only cleared once composition handling has fully settled.
    expect(ctx.editor.yTextString).toBe('Hi');
    expect(es.isComposing).toBe(false);
  } finally {
    await teardownInlineEditor(ctx);
  }
});
