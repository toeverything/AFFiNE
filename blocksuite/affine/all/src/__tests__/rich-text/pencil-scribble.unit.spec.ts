import { insertTextFromPencilScribble } from '@blocksuite/affine/rich-text';
import { InlineEditor } from '@blocksuite/std/inline';
import { afterEach, describe, expect, test } from 'vitest';
import * as Y from 'yjs';

afterEach(() => {
  document.body.replaceChildren();
});

function setupInlineEditor(text = '') {
  const yDoc = new Y.Doc();
  const yText = yDoc.getText('text');
  if (text) {
    yText.insert(0, text);
  }
  const inlineEditor = new InlineEditor(yText);
  const root = document.createElement('div');
  document.body.append(root);
  inlineEditor.mount(root);
  return { inlineEditor, root, yText };
}

describe('insertTextFromPencilScribble', () => {
  test('inserts text through the mounted InlineEditor and advances the inline range', () => {
    const { inlineEditor, root, yText } = setupInlineEditor('ab');
    inlineEditor.setInlineRange({ index: 1, length: 0 });

    expect(insertTextFromPencilScribble(root, '你')).toBe(true);

    expect(yText.toString()).toBe('a你b');
    expect(inlineEditor.getInlineRange()).toEqual({ index: 2, length: 0 });
  });

  test('uses the inline editor end when no range is selected', () => {
    const { inlineEditor, root, yText } = setupInlineEditor('ab');
    inlineEditor.setInlineRange(null);

    expect(insertTextFromPencilScribble(root, '你')).toBe(true);

    expect(yText.toString()).toBe('ab你');
    expect(inlineEditor.getInlineRange()).toEqual({ index: 3, length: 0 });
  });

  test('rejects composing editors without mutating text', () => {
    const { inlineEditor, root, yText } = setupInlineEditor('ab');
    inlineEditor.setInlineRange({ index: 1, length: 0 });
    Object.defineProperty(inlineEditor, 'isComposing', {
      configurable: true,
      get: () => true,
    });

    expect(insertTextFromPencilScribble(root, '你')).toBe(false);

    expect(yText.toString()).toBe('ab');
    expect(inlineEditor.getInlineRange()).toEqual({ index: 1, length: 0 });
  });
});
