import { LinkExtension } from '@blocksuite/affine-inline-link';
import { textKeymap } from '@blocksuite/affine-inline-preset';
import type {
  ListBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import { insertContent } from '@blocksuite/affine-rich-text';
import { REFERENCE_NODE } from '@blocksuite/affine-shared/consts';
import { createDefaultDoc } from '@blocksuite/affine-shared/utils';
import { TextSelection } from '@blocksuite/std';
import type { InlineMarkdownMatch } from '@blocksuite/std/inline';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { defaultSlashMenuConfig } from '../../../../affine/widgets/slash-menu/src/config.js';
import type {
  SlashMenuActionItem,
  SlashMenuItem,
} from '../../../../affine/widgets/slash-menu/src/types.js';
import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

type RichTextElement = HTMLElement & {
  inlineEditor: {
    getFormat: (range: {
      index: number;
      length: number;
    }) => Record<string, unknown>;
    getInlineRange: () => { index: number; length: number } | null;
    setInlineRange: (range: { index: number; length: number }) => void;
    yTextString: string;
  };
  markdownMatches: InlineMarkdownMatch[];
  undoManager: {
    stopCapturing: () => void;
  };
};

function findSlashActionItem(
  items: SlashMenuItem[],
  name: string
): SlashMenuActionItem {
  const item = items.find(entry => entry.name === name);
  if (!item || !('action' in item)) {
    throw new Error(`Cannot find slash-menu action: ${name}`);
  }
  return item;
}

function getRichTextByBlockId(blockId: string): RichTextElement {
  const block = editor.host?.view.getBlock(blockId) as HTMLElement | null;
  if (!block) {
    throw new Error(`Cannot find block view: ${blockId}`);
  }
  const richText = block.querySelector('rich-text') as RichTextElement | null;
  if (!richText) {
    throw new Error(`Cannot find rich-text for block: ${blockId}`);
  }
  return richText;
}

async function createParagraph(text = '') {
  const noteId = addNote(doc);
  const note = doc.getBlock(noteId)?.model;
  if (!note) {
    throw new Error('Cannot find note model');
  }
  const paragraph = note.children[0] as ParagraphBlockModel | undefined;
  if (!paragraph) {
    throw new Error('Cannot find paragraph model');
  }
  if (text) {
    doc.updateBlock(paragraph, {
      text: new Text(text),
    });
  }
  await wait();
  return {
    noteId,
    paragraphId: paragraph.id,
  };
}

function setTextSelection(blockId: string, index: number, length: number) {
  const to = length
    ? {
        blockId,
        index: index + length,
        length: 0,
      }
    : null;
  const selection = editor.host?.selection.create(TextSelection, {
    from: {
      blockId,
      index,
      length: 0,
    },
    to,
  });
  if (!selection) {
    throw new Error('Cannot create text selection');
  }
  editor.host?.selection.setGroup('note', [selection]);
  const richText = getRichTextByBlockId(blockId);
  richText.inlineEditor.setInlineRange({ index, length });
}

async function triggerMarkdown(
  blockId: string,
  input: string,
  matcherName: string
) {
  const model = doc.getBlock(blockId)?.model as ParagraphBlockModel | undefined;
  if (!model) {
    throw new Error(`Cannot find paragraph model: ${blockId}`);
  }
  doc.updateBlock(model, {
    text: new Text(input),
  });
  await wait();

  const richText = getRichTextByBlockId(blockId);
  const matcher = richText.markdownMatches.find(
    item => item.name === matcherName
  );
  if (!matcher) {
    throw new Error(`Cannot find markdown matcher: ${matcherName}`);
  }
  const inlineRange = { index: input.length, length: 0 };
  setTextSelection(blockId, inlineRange.index, 0);

  matcher.action({
    inlineEditor: richText.inlineEditor as any,
    prefixText: input,
    inlineRange,
    pattern: matcher.pattern,
    undoManager: richText.undoManager as any,
  });

  await wait();
}

function mockKeyboardContext() {
  const preventDefault = vi.fn();
  const ctx = {
    get(key: string) {
      if (key === 'keyboardState') {
        return { raw: { preventDefault } };
      }
      throw new Error(`Unexpected state key: ${key}`);
    },
  };
  return { ctx: ctx as any, preventDefault };
}

beforeEach(async () => {
  const cleanup = await setupEditor('page', [LinkExtension]);
  return cleanup;
});

describe('markdown/list/paragraph/quote/code/link', () => {
  test('markdown list shortcut converts to todo list and keeps checked state', async () => {
    const { noteId, paragraphId } = await createParagraph();
    await triggerMarkdown(paragraphId, '[x] ', 'list');

    const note = doc.getBlock(noteId)?.model;
    if (!note) {
      throw new Error('Cannot find note model');
    }
    const model = note.children[0] as ListBlockModel;
    expect(model.flavour).toBe('affine:list');
    expect(model.props.type).toBe('todo');
    expect(model.props.checked).toBe(true);
  });

  test('markdown heading and quote shortcuts convert paragraph type', async () => {
    const { noteId: headingNoteId, paragraphId: headingParagraphId } =
      await createParagraph();
    await triggerMarkdown(headingParagraphId, '# ', 'heading');
    const headingNote = doc.getBlock(headingNoteId)?.model;
    if (!headingNote) {
      throw new Error('Cannot find heading note model');
    }
    const headingModel = headingNote.children[0] as ParagraphBlockModel;
    expect(headingModel.flavour).toBe('affine:paragraph');
    expect(headingModel.props.type).toBe('h1');

    const { noteId: quoteNoteId, paragraphId: quoteParagraphId } =
      await createParagraph();
    await triggerMarkdown(quoteParagraphId, '> ', 'heading');
    const quoteNote = doc.getBlock(quoteNoteId)?.model;
    if (!quoteNote) {
      throw new Error('Cannot find quote note model');
    }
    const quoteModel = quoteNote.children[0] as ParagraphBlockModel;
    expect(quoteModel.flavour).toBe('affine:paragraph');
    expect(quoteModel.props.type).toBe('quote');
  });

  test('markdown code shortcut converts paragraph to code block with language', async () => {
    const { noteId, paragraphId } = await createParagraph();
    await triggerMarkdown(paragraphId, '```ts ', 'code-block');

    const note = doc.getBlock(noteId)?.model;
    if (!note) {
      throw new Error('Cannot find note model');
    }
    const model = note.children[0];
    expect(model.flavour).toBe('affine:code');
    expect((model as any).props.language).toBe('typescript');
  });

  test('inline markdown converts style and link attributes', async () => {
    const { paragraphId: boldParagraphId } = await createParagraph();
    await triggerMarkdown(boldParagraphId, '**bold** ', 'bold');
    const boldRichText = getRichTextByBlockId(boldParagraphId);
    expect(boldRichText.inlineEditor.yTextString).toBe('bold');
    expect(
      boldRichText.inlineEditor.getFormat({ index: 1, length: 0 })
    ).toMatchObject({
      bold: true,
    });

    const { paragraphId: codeParagraphId } = await createParagraph();
    await triggerMarkdown(codeParagraphId, '`code` ', 'code');
    const codeRichText = getRichTextByBlockId(codeParagraphId);
    expect(codeRichText.inlineEditor.yTextString).toBe('code');
    expect(
      codeRichText.inlineEditor.getFormat({ index: 1, length: 0 })
    ).toMatchObject({
      code: true,
    });

    const { paragraphId: linkParagraphId } = await createParagraph();
    await triggerMarkdown(
      linkParagraphId,
      '[AFFiNE](https://affine.pro) ',
      'link'
    );
    const linkRichText = getRichTextByBlockId(linkParagraphId);
    expect(linkRichText.inlineEditor.yTextString).toBe('AFFiNE');
    expect(
      linkRichText.inlineEditor.getFormat({ index: 1, length: 0 })
    ).toMatchObject({
      link: 'https://affine.pro',
    });
  });
});

describe('hotkey/bracket/linked-page', () => {
  test('bracket keymap skips redundant right bracket in code block', async () => {
    const { noteId, paragraphId } = await createParagraph();
    await triggerMarkdown(paragraphId, '```ts ', 'code-block');
    const note = doc.getBlock(noteId)?.model;
    const codeId = note?.children[0]?.id;
    if (!codeId) {
      throw new Error('Cannot find code block id');
    }
    const codeModel = doc.getBlock(codeId)?.model;
    if (!codeModel) {
      throw new Error('Cannot find code block model');
    }
    const keymap = textKeymap(editor.std);
    const leftHandler = keymap['('];
    const rightHandler = keymap[')'];
    expect(leftHandler).toBeDefined();
    if (!rightHandler) {
      throw new Error('Cannot find bracket key handlers');
    }

    doc.updateBlock(codeModel, {
      text: new Text('()'),
    });
    await wait();
    const codeRichText = getRichTextByBlockId(codeId);
    setTextSelection(codeId, 1, 0);
    const rightContext = mockKeyboardContext();
    rightHandler(rightContext.ctx);
    expect(rightContext.preventDefault).not.toHaveBeenCalled();
    expect(codeRichText.inlineEditor.yTextString).toBe('()');
  });

  test('consecutive linked-page reference nodes render as separate references', async () => {
    const { paragraphId } = await createParagraph();
    const paragraphModel = doc.getBlock(paragraphId)?.model as
      | ParagraphBlockModel
      | undefined;
    if (!paragraphModel) {
      throw new Error('Cannot find paragraph model');
    }
    const linkedDoc = createDefaultDoc(collection, {
      title: 'Linked page',
    });

    setTextSelection(paragraphId, 0, 0);
    insertContent(editor.std, paragraphModel, REFERENCE_NODE, {
      reference: {
        type: 'LinkedPage',
        pageId: linkedDoc.id,
      },
    });
    insertContent(editor.std, paragraphModel, REFERENCE_NODE, {
      reference: {
        type: 'LinkedPage',
        pageId: linkedDoc.id,
      },
    });
    await wait();
    expect(collection.docs.has(linkedDoc.id)).toBe(true);

    const richText = getRichTextByBlockId(paragraphId);
    expect(richText.querySelectorAll('affine-reference').length).toBe(2);
    expect(richText.inlineEditor.yTextString.length).toBe(2);
  });
});

describe('slash-menu action semantics', () => {
  test('date and move actions mutate block content/order as expected', async () => {
    const noteId = addNote(doc);
    const note = doc.getBlock(noteId)?.model;
    if (!note) {
      throw new Error('Cannot find note model');
    }
    const first = note.children[0] as ParagraphBlockModel;
    const secondId = doc.addBlock(
      'affine:paragraph',
      { text: new Text('second') },
      noteId
    );
    const second = doc.getBlock(secondId)?.model as
      | ParagraphBlockModel
      | undefined;
    if (!second) {
      throw new Error('Cannot find second paragraph model');
    }
    doc.updateBlock(first, { text: new Text('first') });
    await wait();

    const slashItems = defaultSlashMenuConfig.items;
    const items =
      typeof slashItems === 'function'
        ? slashItems({ std: editor.std, model: first })
        : slashItems;
    const today = findSlashActionItem(items, 'Today');
    const moveDown = findSlashActionItem(items, 'Move Down');
    const moveUp = findSlashActionItem(items, 'Move Up');

    moveDown.action({ std: editor.std, model: first });
    await wait();
    expect(note.children.map(child => child.id)).toEqual([second.id, first.id]);

    moveUp.action({ std: editor.std, model: first });
    await wait();
    expect(note.children.map(child => child.id)).toEqual([first.id, second.id]);

    setTextSelection(first.id, 0, 0);
    today.action({ std: editor.std, model: first });
    await wait();
    const richText = getRichTextByBlockId(first.id);
    expect(richText.inlineEditor.yTextString).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});
