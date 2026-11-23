import { PeekViewExtension } from '@blocksuite/affine/components/peek';
import {
  DatabaseBlockDataSource,
  databaseBlockProperties,
  EditorHostKey,
} from '@blocksuite/affine-block-database';
import { LinkExtension } from '@blocksuite/affine-inline-link';
import { textKeymap } from '@blocksuite/affine-inline-preset';
import type { AffineReference } from '@blocksuite/affine-inline-reference';
import type {
  DatabaseBlockModel,
  EmbedYoutubeModel,
  ListBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import { insertContent } from '@blocksuite/affine-rich-text';
import { REFERENCE_NODE } from '@blocksuite/affine-shared/consts';
import {
  IconPickerServiceIdentifier,
  IconType,
} from '@blocksuite/affine-shared/services';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { createDefaultDoc } from '@blocksuite/affine-shared/utils';
import type { SingleViewBase } from '@blocksuite/data-view';
import {
  KeymapExtension,
  SurfaceSelection,
  TextSelection,
} from '@blocksuite/std';
import type { InlineMarkdownMatch } from '@blocksuite/std/inline';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { DatabaseTitle } from '../../../../affine/blocks/database/src/components/title/index.js';
import type { TableBlockComponent } from '../../../../affine/blocks/table/src/table-block.js';
import type { TableCell } from '../../../../affine/blocks/table/src/table-cell.js';
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

test.each([false, true])(
  'normalizes YouTube IDs without a mounted view (readonly: %s)',
  readonly => {
    const detached = createDefaultDoc(collection, { title: 'YouTube import' });
    const note = detached.getModelsByFlavour('affine:note')[0];
    const id = detached.addBlock(
      'affine:embed-youtube',
      { url: 'https://youtu.be/first' },
      note.id
    );
    const model = detached.getModelById(id) as EmbedYoutubeModel;
    expect(model.props.videoId).toBe('first');
    expect(model.yBlock.get('prop:videoId')).toBe('first');
    detached.readonly = readonly;
    model.yBlock.set('prop:url', 'https://www.youtube.com/watch?v=second');
    expect(model.props.videoId).toBe(readonly ? 'first' : 'second');
    detached.readonly = false;
  }
);

test.each([
  { type: 'application/pdf', readonly: false, peeked: true },
  { type: 'application/zip', readonly: false, peeked: false },
  { type: 'application/pdf', readonly: true, peeked: true },
  { type: 'application/zip', readonly: true, peeked: true },
])(
  'double-clicking a $type attachment (readonly: $readonly) opens the peek view: $peeked',
  async ({ type, readonly, peeked }) => {
    const peek = vi.fn();
    await setupEditor('page', [PeekViewExtension({ peek })]);
    const noteId = addNote(doc);
    const id = doc.addBlock(
      'affine:attachment',
      { name: 'file', type, size: 1 },
      noteId
    );
    await wait();
    doc.readonly = readonly;
    editor
      .host!.view.getBlock(id)!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    doc.readonly = false;
    expect(peek).toHaveBeenCalledTimes(peeked ? 1 : 0);
  }
);

test('typing into a sorted database title keeps editing the same row', async () => {
  const noteId = addNote(doc);
  const id = doc.addBlock('affine:database', {}, noteId);
  const model = doc.getModelById(id) as DatabaseBlockModel;
  const source = new DatabaseBlockDataSource(model, source => {
    source.serviceSet(EditorHostKey, editor.host!);
  });
  const viewId = source.viewManager.viewAdd('table');
  const titleId = source.properties$.value.find(
    propertyId => source.propertyTypeGet(propertyId) === 'title'
  )!;
  const editedRow = source.rowAdd('end');
  const otherRow = source.rowAdd('end');
  doc.updateBlock(doc.getModelById(editedRow)!, { text: new Text('b') });
  doc.updateBlock(doc.getModelById(otherRow)!, { text: new Text('c') });
  source.viewDataUpdate(viewId, data => ({
    ...data,
    sort: {
      manuallySort: [],
      sortBy: [{ ref: { type: 'ref', name: titleId }, desc: false }],
    },
  }));
  await wait();
  const database = editor.host!.view.getBlock(id)!;
  await database.updateComplete;
  await wait();
  const container = database.querySelector<
    HTMLElement & { selectCurrentCell: (editing: boolean) => void }
  >(
    `dv-table-view-cell-container[data-row-id="${editedRow}"][data-column-id="${titleId}"]`
  )!;

  container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  container.selectCurrentCell(false);
  await wait();
  container.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'z', bubbles: true, cancelable: true })
  );
  await wait();
  await wait();

  const titleCells = database.querySelectorAll<HTMLElement>(
    `dv-table-view-cell-container[data-column-id="${titleId}"]`
  );
  expect(Array.from(titleCells, cell => cell.dataset.rowId)).toEqual([
    editedRow,
    otherRow,
  ]);
  expect(titleCells[0].dataset.editing).toBe('true');
});

test.each([
  { hasIcon: true, target: '[data-testid="callout-emoji"]', opened: true },
  { hasIcon: true, target: 'rich-text', opened: false },
  { hasIcon: false, target: 'rich-text', opened: false },
])(
  'clicking $target in a callout (icon: $hasIcon) opens the icon picker: $opened',
  async ({ hasIcon, target, opened }) => {
    await setupEditor('page', [
      {
        setup: di => {
          di.override(IconPickerServiceIdentifier, () => ({
            iconPickerComponent: () => ({ update() {}, unmount() {} }),
          }));
        },
      },
    ]);
    const noteId = addNote(doc);
    const calloutId = doc.addBlock(
      'affine:callout',
      { icon: hasIcon ? { type: IconType.Emoji, unicode: '💡' } : undefined },
      noteId
    );
    doc.addBlock('affine:paragraph', { text: new Text('text') }, calloutId);
    await wait();
    editor
      .host!.view.getBlock(calloutId)!
      .querySelector<HTMLElement>(target)!
      .click();
    await wait();
    expect(editor.host!.querySelector('icon-picker-wrapper') !== null).toBe(
      opened
    );
  }
);

test.each([
  { name: 'after the next pointer move', moveAfterScroll: true },
  { name: 'while the pointer rests', moveAfterScroll: false },
])(
  'table drag selection follows the pointer across a scroll $name',
  async ({ moveAfterScroll }) => {
    const columnIds = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
    const noteId = addNote(doc);
    const tableId = doc.addBlock(
      'affine:table',
      {
        rows: { r0: { rowId: 'r0', order: 'a0' } },
        columns: Object.fromEntries(
          columnIds.map((columnId, index) => [
            columnId,
            { columnId, order: `a${index}`, width: 300 },
          ])
        ),
        cells: Object.fromEntries(
          columnIds.map(columnId => [
            `r0:${columnId}`,
            { text: new Text(columnId) },
          ])
        ),
      },
      noteId
    );
    await wait();
    const table = editor.host!.view.getBlock(tableId) as TableBlockComponent;
    const cells = Array.from(
      table.querySelectorAll<HTMLElement>('affine-table-cell td')
    );
    const center = (cell: HTMLElement) => {
      const rect = cell.getBoundingClientRect();
      return {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      };
    };
    const mouse = (type: string, target: EventTarget, at: MouseEventInit) =>
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, ...at }));

    const scroller = table.querySelector<HTMLElement>(
      '[contenteditable="false"]'
    )!;
    scroller.scrollLeft = 0;
    await wait();

    mouse('mousedown', cells[0], center(cells[0]));
    const pointer = center(cells[1]);
    mouse('mousemove', cells[1], pointer);
    scroller.scrollLeft = 600;
    scroller.dispatchEvent(new Event('scroll'));
    await wait();
    if (moveAfterScroll) {
      mouse('mousemove', cells[3], pointer);
    }
    await wait();
    mouse('mouseup', window, pointer);

    expect(table.selectionController.getSelected()).toEqual({
      type: 'area',
      rowStartIndex: 0,
      rowEndIndex: 0,
      columnStartIndex: 0,
      columnEndIndex: 3,
    });
  }
);

test.each(['page', 'edgeless'] as const)(
  'table selection preserves its input owner in %s mode',
  async mode => {
    await setupEditor(mode);
    const noteId = addNote(doc);
    const tableId = doc.addBlock(
      'affine:table',
      {
        rows: { row: { rowId: 'row', order: 'a0' } },
        columns: { column: { columnId: 'column', order: 'a0' } },
        cells: { 'row:column': { text: new Text('abc') } },
      },
      noteId
    );
    await wait();
    const table = editor.host!.view.getBlock(tableId) as TableBlockComponent;
    const cell = table.querySelector('affine-table-cell') as TableCell;
    const surfaceSelection = new SurfaceSelection(
      doc.getModelsByFlavour('affine:surface')[0].id,
      [noteId],
      true
    );
    if (mode === 'edgeless') {
      editor.std.selection.setGroup('gfx', [surfaceSelection]);
    }
    cell.inlineEditor!.focusEnd();
    await wait();
    cell.text!.insert('xyz', 3);
    await wait();
    expect(cell.text!.toString()).toBe('abcxyz');
    expect(table.selectionController.getSelected()?.type).toBe('area');
    expect(editor.std.selection.getGroup('gfx')).toEqual(
      mode === 'edgeless' ? [surfaceSelection] : []
    );
    table.selectionController.setSelected({
      type: 'column',
      columnId: 'column',
    });
    table.selectionController.setSelected(undefined);
    expect(table.selectionController.getSelected()).toBeUndefined();
    expect(editor.std.selection.getGroup('gfx')).toEqual(
      mode === 'edgeless' ? [surfaceSelection] : []
    );
  }
);

test.each(
  Object.values(databaseBlockProperties).filter(
    property => !['title', 'created-time'].includes(property.type)
  )
)(
  'database searches plain and linked titles despite malformed $type cells',
  async property => {
    const noteId = addNote(doc);
    const id = doc.addBlock('affine:database', {}, noteId);
    const model = doc.getModelById(id) as DatabaseBlockModel;
    const source = new DatabaseBlockDataSource(model, source => {
      source.serviceSet(EditorHostKey, editor.host!);
    });
    source.viewManager.viewAdd('table');
    const propertyId = source.propertyAdd('end', { type: property.type })!;
    const malformedRow = source.rowAdd('end');
    const normalRow = source.rowAdd('end');
    const linkedDoc = createDefaultDoc(collection, { title: 'Planning notes' });
    const linkedRow = source.rowAdd('end');
    const linkedText = new Text<AffineTextAttributes>([
      {
        insert: ' ',
        attributes: { reference: { type: 'LinkedPage', pageId: linkedDoc.id } },
      },
    ]);
    doc.updateBlock(doc.getModelById(linkedRow)!, { text: linkedText });
    await wait();
    const database = editor.host!.view.getBlock(id)!;
    await database.updateComplete;
    const title = database.querySelector<DatabaseTitle>(
      'affine-database-title'
    )!;
    await title.updateComplete;
    expect(title.querySelector('textarea')).not.toBeNull();
    const defaultValue = property.config.rawValue.default();
    source.cellValueChange(normalRow, propertyId, defaultValue);
    expect(source.cellValueGet(normalRow, propertyId)).toEqual(defaultValue);
    const invalidValue = { legacy: 'invalid' };
    doc.updateBlock(model, {
      cells: {
        ...model.props.cells,
        [malformedRow]: {
          [propertyId]: { columnId: propertyId, value: invalidValue },
        },
      },
    });
    expect(source.cellValueGet(malformedRow, propertyId)).toEqual(defaultValue);
    expect(model.props.cells[malformedRow][propertyId].value).toEqual(
      invalidValue
    );
    const normal = doc.getModelById(normalRow) as ParagraphBlockModel;
    normal.props.text.insert('needle', 0);
    const view = source.viewManager.currentView$.value as SingleViewBase;
    view.setSearch('needle');
    expect(view.rows$.value.map(row => row.rowId)).toEqual([normalRow]);
    view.setSearch('Planning');
    expect(view.rows$.value.map(row => row.rowId)).toEqual([linkedRow]);
    collection.meta.setDocMeta(linkedDoc.id, { title: 'Updated agenda' });
    expect(view.rows$.value.map(row => row.rowId)).toEqual([]);
    view.setSearch('Updated');
    expect(view.rows$.value.map(row => row.rowId)).toEqual([linkedRow]);
    expect(linkedText.toString()).toBe(' ');
    const titleCell = view.cellGetOrCreate(
      linkedRow,
      view.mainProperties$.value.titleColumn!
    );
    expect(titleCell.stringValue$.value).toBe('Updated agenda');
    expect(titleCell.jsonValue$.value).toBe('Updated agenda');
    linkedText.format(0, 1, {
      reference: {
        type: 'LinkedPage',
        pageId: linkedDoc.id,
        title: 'Roadmap alias',
      },
    });
    view.setSearch('Roadmap');
    expect(view.rows$.value.map(row => row.rowId)).toEqual([linkedRow]);
    collection.meta.setDocMeta(linkedDoc.id, { title: 'Renamed again' });
    expect(titleCell.stringValue$.value).toBe('Roadmap alias');
    linkedText.insert('Topic: ', 0);
    view.setSearch('Topic: Roadmap');
    expect(view.rows$.value.map(row => row.rowId)).toEqual([linkedRow]);
    linkedText.format(7, 1, {
      reference: { type: 'LinkedPage', pageId: 'missing-document' },
    });
    view.setSearch('Topic: Deleted doc');
    expect(view.rows$.value.map(row => row.rowId)).toEqual([linkedRow]);
    expect(
      databaseBlockProperties.titleColumnConfig.config.rawValue.toString({
        value: linkedText,
        data: {},
      })
    ).toBe('Topic:  ');
    await wait();
    expect(model.props.cells[malformedRow][propertyId].value).toEqual(
      invalidValue
    );
  }
);

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

  test('spellcheck is disabled in code blocks only', async () => {
    const { noteId, paragraphId } = await createParagraph('paragraph');
    const codeId = doc.addBlock(
      'affine:code',
      { text: new Text('const value = 1;') },
      noteId
    );
    await wait();

    const editable = (blockId: string) =>
      getRichTextByBlockId(blockId).querySelector<HTMLElement>(
        '[contenteditable="true"]'
      )!;
    expect(editable(codeId).spellcheck).toBe(false);
    expect(editable(paragraphId).closest('[spellcheck="false"]')).toBeNull();
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

test.each([
  ['formatBold', 'Mod-b'],
  ['formatItalic', 'Mod-i'],
  ['formatUnderline', 'Mod-u'],
])(
  'native %s input runs the %s binding of the block',
  async (inputType, hotkey) => {
    const bindings = {
      'Mod-b': vi.fn(() => true),
      'Mod-i': vi.fn(() => true),
      'Mod-u': vi.fn(() => true),
    };
    await setupEditor('page', [
      KeymapExtension(() => bindings, { flavour: 'affine:paragraph' }),
    ]);
    const { paragraphId } = await createParagraph('hello');
    setTextSelection(paragraphId, 0, 5);
    editor.std.event.active = true;
    const event = new InputEvent('beforeinput', {
      inputType,
      bubbles: true,
      cancelable: true,
    });

    getRichTextByBlockId(paragraphId).dispatchEvent(event);

    for (const [key, binding] of Object.entries(bindings)) {
      expect(binding).toHaveBeenCalledTimes(key === hotkey ? 1 : 0);
    }
    expect(event.defaultPrevented).toBe(true);
  }
);

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
    await wait();
    const rightContext = mockKeyboardContext();
    rightHandler(rightContext.ctx);
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

    collection.removeDoc(linkedDoc.id);
    await wait();
    expect(collection.docs.has(linkedDoc.id)).toBe(false);
    const danglingReferences =
      richText.querySelectorAll<AffineReference>('affine-reference');
    expect(danglingReferences.length).toBe(2);
    expect([...danglingReferences].every(reference => !reference.refMeta)).toBe(
      true
    );
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
