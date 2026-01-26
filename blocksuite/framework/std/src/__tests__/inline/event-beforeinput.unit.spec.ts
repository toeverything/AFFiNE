import { expect, test, vi } from 'vitest';
import * as Y from 'yjs';

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

test('beforeinput prevents native edits for selection partially outside inline root', async () => {
  const ctx = await setupInlineEditor('hello');
  try {
    const range = ctx.editor.toDomRange({ index: 1, length: 0 });
    expect(range).not.toBeNull();
    range!.setEnd(ctx.outside, 0);
    setNativeSelection(range!);

    const preventDefault = vi.fn();
    const event = {
      inputType: 'deleteContentForward',
      data: null,
      dataTransfer: null,
      preventDefault,
      stopPropagation: vi.fn(),
      getTargetRanges: () => [],
    } as unknown as InputEvent;

    await (ctx.editor.eventService as any)._onBeforeInput(event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(ctx.editor.yTextString).toBe('h');
  } finally {
    await teardownInlineEditor(ctx);
  }
});

test('beforeinput does not intercept when selection spans another inline root', async () => {
  const ctx1 = await setupInlineEditor('abc');
  const ctx2 = await setupInlineEditor('xyz');
  try {
    const startRange = ctx1.editor.toDomRange({ index: 1, length: 0 });
    const endRange = ctx2.editor.toDomRange({ index: 1, length: 0 });
    expect(startRange).not.toBeNull();
    expect(endRange).not.toBeNull();

    const selectionRange = document.createRange();
    selectionRange.setStart(
      startRange!.startContainer,
      startRange!.startOffset
    );
    selectionRange.setEnd(endRange!.endContainer, endRange!.endOffset);
    setNativeSelection(selectionRange);

    const preventDefault = vi.fn();
    const event = {
      inputType: 'deleteContentForward',
      data: null,
      dataTransfer: null,
      preventDefault,
      stopPropagation: vi.fn(),
      getTargetRanges: () => [],
    } as unknown as InputEvent;

    await (ctx1.editor.eventService as any)._onBeforeInput(event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(ctx1.editor.yTextString).toBe('abc');
  } finally {
    await teardownInlineEditor(ctx1);
    await teardownInlineEditor(ctx2);
  }
});

test('beforeinput ignores un-resolvable target range and still applies input', async () => {
  const ctx = await setupInlineEditor('hello world');
  try {
    const range = ctx.editor.toDomRange({ index: 0, length: 5 });
    expect(range).not.toBeNull();
    setNativeSelection(range!);

    const preventDefault = vi.fn();
    const event = {
      inputType: 'insertText',
      data: 'x',
      dataTransfer: null,
      preventDefault,
      stopPropagation: vi.fn(),
      getTargetRanges: () => [
        {
          startContainer: ctx.outside,
          startOffset: 0,
          endContainer: ctx.outside,
          endOffset: 0,
        },
      ],
    } as unknown as InputEvent;

    await (ctx.editor.eventService as any)._onBeforeInput(event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(ctx.editor.yTextString).toBe('x world');
  } finally {
    await teardownInlineEditor(ctx);
  }
});
