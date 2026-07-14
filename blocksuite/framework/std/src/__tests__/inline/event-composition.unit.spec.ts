import { expect, test, vi } from 'vitest';
import * as Y from 'yjs';

// Force the Android IME code path, which is where autocorrect-on-space
// composition is handled. See https://github.com/toeverything/AFFiNE/issues/14021
vi.mock('@blocksuite/global/env', async importOriginal => {
  const actual = await importOriginal<Record<string, unknown>>();
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
  document.body.append(root);
  editor.mount(root);
  await editor.waitForUpdate();

  return { editor, root };
}

function setNativeSelection(range: Range) {
  const selection = document.getSelection();
  if (!selection) {
    throw new Error('Selection is not available');
  }
  selection.removeAllRanges();
  selection.addRange(range);
}

// The DOM-text cache is invalidated by a MutationObserver, which runs
// asynchronously, so let it settle after each simulated composition edit.
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

// Drive the Android IME sequence for composing `word` at `startIndex`, then
// committing `commit` on space (autocorrect may rewrite the word on commit).
// During composition the browser inserts the composing text into the DOM but
// not into the model, exactly like a real IME.
async function composeAndCommit(
  editor: InlineEditor,
  startIndex: number,
  word: string,
  commit: string
) {
  const eventService = editor.eventService as any;

  const domRange = editor.toDomRange({ index: startIndex, length: 0 });
  if (!domRange) throw new Error('Cannot resolve start dom range');
  const textNode = domRange.startContainer as Text;
  const baseOffset = domRange.startOffset;

  const startRange = document.createRange();
  startRange.setStart(textNode, baseOffset);
  startRange.setEnd(textNode, baseOffset);
  setNativeSelection(startRange);
  eventService._onCompositionStart(
    new CompositionEvent('compositionstart', { data: '' })
  );

  for (let i = 1; i <= word.length; i++) {
    textNode.replaceData(baseOffset, i - 1, word.slice(0, i));
    await tick();

    const caret = document.createRange();
    caret.setStart(textNode, baseOffset + i);
    caret.setEnd(textNode, baseOffset + i);
    setNativeSelection(caret);

    const staticRange = {
      startContainer: textNode,
      startOffset: baseOffset,
      endContainer: textNode,
      endOffset: baseOffset + i,
    };
    await eventService._onBeforeInput({
      inputType: 'insertCompositionText',
      data: word.slice(0, i),
      dataTransfer: null,
      isComposing: true,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      getTargetRanges: () => [staticRange],
    } as unknown as InputEvent);
  }

  const caret = document.createRange();
  caret.setStart(textNode, baseOffset + word.length);
  caret.setEnd(textNode, baseOffset + word.length);
  setNativeSelection(caret);
  await eventService._onCompositionEnd(
    new CompositionEvent('compositionend', { data: commit })
  );
  await editor.waitForUpdate();
}

test('android IME commits a composed word at the caret, not the end of the line', async () => {
  const { editor, root } = await setupInlineEditor('XY');
  try {
    // Compose "ab" before the existing "XY".
    await composeAndCommit(editor, 0, 'ab', 'ab');
    expect(editor.yTextString).toBe('abXY');
  } finally {
    editor.unmount();
    root.remove();
  }
});

test('android IME autocorrect on space keeps the corrected word in place', async () => {
  const { editor, root } = await setupInlineEditor('XY');
  try {
    // Compose the misspelled "wrold" before "XY"; autocorrect commits "world".
    await composeAndCommit(editor, 0, 'wrold', 'world');
    expect(editor.yTextString).toBe('worldXY');
  } finally {
    editor.unmount();
    root.remove();
  }
});

test('applies input at the current inline range when the native range is stale', async () => {
  // Reproduces the Samsung sequence: compositionend rebuilds the editor DOM
  // (detaching the composition nodes), then the following space arrives with a
  // native selection still pointing at the now-detached node. The editor must
  // apply the space at its own inline range instead of letting the browser
  // mutate the DOM natively (which desyncs DOM and model). See issue #14021.
  const { editor, root } = await setupInlineEditor('Wort');
  try {
    editor.setInlineRange({ index: 4, length: 0 });

    // A detached node standing in for the replaced composition DOM.
    const staleNode = document.createTextNode('\n ');
    document.body.append(staleNode);
    const staleRange = document.createRange();
    staleRange.setStart(staleNode, 1);
    staleRange.setEnd(staleNode, 1);
    setNativeSelection(staleRange);

    const preventDefault = vi.fn();
    await (editor.eventService as any)._onBeforeInput({
      inputType: 'insertText',
      data: ' ',
      dataTransfer: null,
      isComposing: false,
      target: root,
      preventDefault,
      stopPropagation: vi.fn(),
      getTargetRanges: () => [
        {
          startContainer: staleNode,
          startOffset: 1,
          endContainer: staleNode,
          endOffset: 1,
        },
      ],
    } as unknown as InputEvent);

    staleNode.remove();

    expect(preventDefault).toHaveBeenCalledOnce();
    // The space landed at the caret in the model, no native corruption.
    expect(editor.yTextString).toBe('Wort ');
  } finally {
    editor.unmount();
    root.remove();
  }
});

test('android insertParagraph does not insert an inline line break', async () => {
  // On Android, Enter arrives as an `insertParagraph` beforeinput. The inline
  // editor must not turn it into a soft line break; the block keymap performs
  // the paragraph split instead. See issue #14021.
  const ctx = await setupInlineEditor('ab');
  try {
    const range = ctx.editor.toDomRange({ index: 2, length: 0 });
    expect(range).not.toBeNull();
    setNativeSelection(range!);

    const preventDefault = vi.fn();
    await (ctx.editor.eventService as any)._onBeforeInput({
      inputType: 'insertParagraph',
      data: null,
      dataTransfer: null,
      preventDefault,
      stopPropagation: vi.fn(),
      getTargetRanges: () => [],
    } as unknown as InputEvent);

    expect(preventDefault).toHaveBeenCalledOnce();
    // No "\n" was inserted into the model.
    expect(ctx.editor.yTextString).toBe('ab');
  } finally {
    ctx.editor.unmount();
    ctx.root.remove();
  }
});

test('android insertParagraph during composition does not insert a soft line break', async () => {
  // The paragraph guard must run before the composing branch, otherwise Enter
  // during composition is swallowed without preventing the native newline.
  const { editor, root } = await setupInlineEditor('ab');
  const eventService = editor.eventService as any;
  try {
    const range = editor.toDomRange({ index: 2, length: 0 });
    expect(range).not.toBeNull();
    setNativeSelection(range!);

    eventService._onCompositionStart(
      new CompositionEvent('compositionstart', { data: '' })
    );
    expect(editor.eventService.isComposing).toBe(true);

    const preventDefault = vi.fn();
    await eventService._onBeforeInput({
      inputType: 'insertParagraph',
      data: null,
      dataTransfer: null,
      isComposing: true,
      target: root,
      preventDefault,
      stopPropagation: vi.fn(),
      getTargetRanges: () => [],
    } as unknown as InputEvent);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(editor.yTextString).toBe('ab');
  } finally {
    editor.unmount();
    root.remove();
  }
});

test('android insertParagraph with a stale native range does not insert a soft line break', async () => {
  // The paragraph guard must run before the stale-range branch, otherwise Enter
  // is turned into an inline line break (insertLineBreak) instead of delegating
  // the block split to the keymap.
  const { editor, root } = await setupInlineEditor('ab');
  const eventService = editor.eventService as any;
  try {
    editor.setInlineRange({ index: 2, length: 0 });

    const staleNode = document.createTextNode('\n ');
    document.body.append(staleNode);
    const staleRange = document.createRange();
    staleRange.setStart(staleNode, 1);
    staleRange.setEnd(staleNode, 1);
    setNativeSelection(staleRange);

    const preventDefault = vi.fn();
    await eventService._onBeforeInput({
      inputType: 'insertParagraph',
      data: null,
      dataTransfer: null,
      isComposing: false,
      target: root,
      preventDefault,
      stopPropagation: vi.fn(),
      getTargetRanges: () => [],
    } as unknown as InputEvent);

    staleNode.remove();

    expect(preventDefault).toHaveBeenCalledOnce();
    // Not turned into a soft "\n" by the stale-range branch.
    expect(editor.yTextString).toBe('ab');
  } finally {
    editor.unmount();
    root.remove();
  }
});

test('android IME keeps the first word typed in an empty field', async () => {
  const { editor, root } = await setupInlineEditor('');
  const eventService = editor.eventService as any;
  try {
    const vText = root.querySelector('[data-v-text="true"]');
    if (!vText) throw new Error('Cannot find v-text');
    const textNode = Array.from(vText.childNodes).find(
      (node): node is Text => node instanceof Text
    );
    if (!textNode) throw new Error('Cannot find text node');

    // An empty line renders a zero-width placeholder that is not part of the
    // model. The IME inserts the composing text into that same text node.
    const placeholder = textNode.data;

    const startRange = document.createRange();
    startRange.setStart(textNode, 0);
    startRange.setEnd(textNode, 0);
    setNativeSelection(startRange);
    eventService._onCompositionStart(
      new CompositionEvent('compositionstart', { data: '' })
    );

    const word = 'hello';
    for (let i = 1; i <= word.length; i++) {
      textNode.data = placeholder + word.slice(0, i);
      await tick();

      const caret = document.createRange();
      caret.setStart(textNode, placeholder.length + i);
      caret.setEnd(textNode, placeholder.length + i);
      setNativeSelection(caret);

      const staticRange = {
        startContainer: textNode,
        startOffset: placeholder.length,
        endContainer: textNode,
        endOffset: placeholder.length + i,
      };
      await eventService._onBeforeInput({
        inputType: 'insertCompositionText',
        data: word.slice(0, i),
        dataTransfer: null,
        isComposing: true,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        getTargetRanges: () => [staticRange],
      } as unknown as InputEvent);
    }

    const caret = document.createRange();
    caret.setStart(textNode, textNode.data.length);
    caret.setEnd(textNode, textNode.data.length);
    setNativeSelection(caret);
    await eventService._onCompositionEnd(
      new CompositionEvent('compositionend', { data: word })
    );
    await editor.waitForUpdate();

    expect(editor.yTextString).toBe('hello');
  } finally {
    editor.unmount();
    root.remove();
  }
});

test('composition commit clamps an out-of-bounds range instead of dropping the text', async () => {
  const { editor, root } = await setupInlineEditor('ab');
  try {
    const domRange = editor.toDomRange({ index: 2, length: 0 });
    expect(domRange).not.toBeNull();
    setNativeSelection(domRange!);

    const eventService = editor.eventService as any;
    // Simulate a captured composition range that is out of bounds for the
    // current model (length 2). The composed text must be kept (clamped), not
    // silently dropped. See issue #14021 review feedback.
    eventService._compositionInlineRange = { index: 99, length: 0 };

    await eventService._onCompositionEnd(
      new CompositionEvent('compositionend', { data: 'xy' })
    );
    await editor.waitForUpdate();

    expect(editor.yTextString).toBe('abxy');
  } finally {
    editor.unmount();
    root.remove();
  }
});
