import '../declare-test-window.js';

import type { DatabaseBlockModel, ListType } from '@blocksuite/affine/model';
import type { RichText } from '@blocksuite/affine/rich-text';
import type {
  InlineRange,
  InlineRootElement,
} from '@blocksuite/affine/std/inline';
import type { BlockModel } from '@blocksuite/affine/store';
import { uuidv4 } from '@blocksuite/affine/store';
import type { TestAffineEditorContainer } from '@blocksuite/integration-test';
import type { ConsoleMessage, Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import stringify from 'json-stable-stringify';
import lz from 'lz-string';

import { ZERO_WIDTH_FOR_EMPTY_LINE } from '../inline-editor.js';
import { currentEditorIndex } from '../multiple-editor.js';
import {
  pressArrowRight,
  pressEnter,
  pressEscape,
  pressSpace,
  pressTab,
  selectAllBlocksByKeyboard,
  SHORT_KEY,
  type,
} from './keyboard.js';

export const defaultPlaygroundURL = new URL(
  `http://localhost:${process.env.CI ? 4173 : 5173}/`
);

const NEXT_FRAME_TIMEOUT = 50;
const DEFAULT_PLAYGROUND = defaultPlaygroundURL.toString();
const RICH_TEXT_SELECTOR = '.inline-editor';

function generateRandomRoomId() {
  return `playwright-${uuidv4()}`;
}

export const getSelectionRect = async (page: Page): Promise<DOMRect> => {
  const rect = await page.evaluate(() => {
    return getSelection()?.getRangeAt(0).getBoundingClientRect();
  });
  if (!rect) {
    throw new Error('rect is not found');
  }
  return rect;
};

export const getEditorLocator = (page: Page) => {
  return page.locator('affine-editor-container').nth(currentEditorIndex);
};

export const getEditorHostLocator = (page: Page) => {
  return page.locator('editor-host').nth(currentEditorIndex);
};

type TaggedConsoleMessage = ConsoleMessage & { __ignore?: boolean };
function ignoredLog(message: ConsoleMessage) {
  (message as TaggedConsoleMessage).__ignore = true;
}
function isIgnoredLog(
  message: ConsoleMessage
): message is TaggedConsoleMessage {
  return '__ignore' in message && !!message.__ignore;
}

/**
 * Expect console message to be called in the test.
 *
 * This function **should** be called before the `enterPlaygroundRoom` function!
 *
 * ```ts
 * expectConsoleMessage(page, 'Failed to load resource'); // Default type is 'error'
 * expectConsoleMessage(page, '[vite] connected.', 'warning'); // Specify type
 * ```
 */
export function expectConsoleMessage(
  page: Page,
  logPrefixOrRegex: string | RegExp,
  type:
    | 'log'
    | 'debug'
    | 'info'
    | 'error'
    | 'warning'
    | 'dir'
    | 'dirxml'
    | 'table'
    | 'trace'
    | 'clear'
    | 'startGroup'
    | 'startGroupCollapsed'
    | 'endGroup'
    | 'assert'
    | 'profile'
    | 'profileEnd'
    | 'count'
    | 'timeEnd' = 'error'
) {
  page.on('console', (message: ConsoleMessage) => {
    const sameType = message.type() === type;
    const textMatch =
      logPrefixOrRegex instanceof RegExp
        ? logPrefixOrRegex.test(message.text())
        : message.text().startsWith(logPrefixOrRegex);
    if (sameType && textMatch) {
      ignoredLog(message);
    }
  });
}

export type PlaygroundRoomOptions = {
  room?: string;
  blobSource?: ('idb' | 'mock')[];
  noInit?: boolean;
};
export async function enterPlaygroundRoom(
  page: Page,
  ops?: PlaygroundRoomOptions
) {
  const url = new URL(DEFAULT_PLAYGROUND);
  let room = ops?.room;
  const blobSource = ops?.blobSource;
  if (!room) {
    room = generateRandomRoomId();
  }
  url.searchParams.set('room', room);
  url.searchParams.set('blobSource', blobSource?.join(',') || 'idb');
  if (ops?.noInit) {
    url.searchParams.set('noInit', 'true');
  }
  await page.goto(url.toString());

  // See https://github.com/microsoft/playwright/issues/5546
  page.on('console', message => {
    if (
      [
        // React devtools:
        '%cDownload the React DevTools for a better development experience: https://reactjs.org/link/react-devtools font-weight:bold',
        // Vite:
        '[vite] connected.',
        '[vite] connecting...',
        // Figma embed:
        'Fullscreen: Using 4GB WASM heap',
        // Lit:
        'Lit is in dev mode. Not recommended for production! See https://lit.dev/msg/dev-mode for more information.',
        // Figma embed:
        'Running frontend commit',
        // Github timeout:
        'Failed to load resource: the server responded with a status of 403',
        // font download warning:
        '[JavaScript Warning: "downloadable font:',
      ].some(text => message.text().startsWith(text))
    ) {
      return;
    }
    const ignore = isIgnoredLog(message) || !process.env.CI;
    if (!ignore) {
      expect
        .soft('Unexpected console message: ' + message.text())
        .toBe(
          'Please remove the "console.log" or declare `expectConsoleMessage` before `enterPlaygroundRoom`. It is advised not to output logs in a production environment.'
        );
    }
    console.log(`Console ${message.type()}: ${message.text()}`);
  });

  // Log all uncaught errors
  page.on('pageerror', exception => {
    throw new Error(`Uncaught exception: "${exception}"\n${exception.stack}`);
  });

  const locator = page.locator('affine-editor-container');
  await locator.isVisible();
  await page.evaluate(async () => {
    const dom = document.querySelector<TestAffineEditorContainer>(
      'affine-editor-container'
    );
    if (dom) {
      await dom.updateComplete;
    }
  });

  await page.evaluate(() => {
    if (typeof window.$blocksuite !== 'object') {
      throw new Error('window.$blocksuite is not object');
    }
  }, []);
  return room;
}

export async function waitDefaultPageLoaded(page: Page) {
  await page.waitForSelector('affine-page-root[data-block-id="0"]');
}

export async function waitEmbedLoaded(page: Page) {
  await page.waitForSelector('.resizable-img');
}

export async function waitNextFrame(
  page: Page,
  frameTimeout = NEXT_FRAME_TIMEOUT
) {
  await page.waitForTimeout(frameTimeout);
}

export async function clearLog(page: Page) {
  await page.evaluate(() => console.clear());
}

export async function captureHistory(page: Page) {
  await page.evaluate(() => {
    window.doc.captureSync();
  });
}

export async function resetHistory(page: Page) {
  await page.evaluate(() => {
    const space = window.doc;
    space.resetHistory();
  });
}

// XXX: This doesn't add surface yet, the page state should not be switched to edgeless.
export async function enterPlaygroundWithList(
  page: Page,
  contents: string[] = ['', '', ''],
  type: ListType = 'bulleted'
) {
  const room = generateRandomRoomId();
  await page.goto(`${DEFAULT_PLAYGROUND}?room=${room}`);

  await page.evaluate(
    ({ contents, type }: { contents: string[]; type: ListType }) => {
      const { doc } = window;
      const rootId = doc.addBlock('affine:page', {
        title: new window.$blocksuite.store.Text(),
      });
      const noteId = doc.addBlock('affine:note', {}, rootId);
      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = 0; i < contents.length; i++) {
        doc.addBlock(
          'affine:list',
          contents.length > 0
            ? { text: new window.$blocksuite.store.Text(contents[i]), type }
            : { type },
          noteId
        );
      }
    },
    { contents, type }
  );
  await waitNextFrame(page);
}

// XXX: This doesn't add surface yet, the doc state should not be switched to edgeless.
export async function initEmptyParagraphState(page: Page, rootId?: string) {
  const ids = await page.evaluate(rootId => {
    const { doc } = window;
    doc.captureSync();
    if (!rootId) {
      rootId = doc.addBlock('affine:page', {
        title: new window.$blocksuite.store.Text(),
      });
    }

    const noteId = doc.addBlock('affine:note', {}, rootId);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    // doc.addBlock('affine:surface', {}, rootId);
    doc.captureSync();

    return { rootId, noteId, paragraphId };
  }, rootId);
  return ids;
}

export async function initMultipleNoteWithParagraphState(
  page: Page,
  rootId?: string,
  count = 2
) {
  const ids = await page.evaluate(
    ({ rootId, count }) => {
      const { doc } = window;
      doc.captureSync();
      if (!rootId) {
        rootId = doc.addBlock('affine:page', {
          title: new window.$blocksuite.store.Text(),
        });
      }

      const ids = Array.from({ length: count })
        .fill(0)
        .map(() => {
          const noteId = doc.addBlock('affine:note', {}, rootId);
          const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
          return { noteId, paragraphId };
        });

      // doc.addBlock('affine:surface', {}, rootId);
      doc.captureSync();

      return { rootId, ids };
    },
    { rootId, count }
  );
  return ids;
}

export async function initEmptyEdgelessState(page: Page) {
  const ids = await page.evaluate(() => {
    const { doc } = window;
    const rootId = doc.addBlock('affine:page', {
      title: new window.$blocksuite.store.Text(),
    });
    doc.addBlock('affine:surface', {}, rootId);
    const noteId = doc.addBlock('affine:note', {}, rootId);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);

    doc.resetHistory();

    return { rootId, noteId, paragraphId };
  });
  return ids;
}

export async function initEmptyDatabaseState(page: Page, rootId?: string) {
  const ids = await page.evaluate(async rootId => {
    const { doc } = window;
    doc.captureSync();
    if (!rootId) {
      rootId = doc.addBlock('affine:page', {
        title: new window.$blocksuite.store.Text(),
      });
    }
    const noteId = doc.addBlock('affine:note', {}, rootId);
    const databaseId = doc.addBlock(
      'affine:database',
      {
        title: new window.$blocksuite.store.Text('Database 1'),
      },
      noteId
    );
    const model = doc.getModelById(databaseId) as DatabaseBlockModel;
    const datasource =
      new window.$blocksuite.blocks.database.DatabaseBlockDataSource(model);
    datasource.viewManager.viewAdd('table');
    doc.captureSync();
    return { rootId, noteId, databaseId };
  }, rootId);
  return ids;
}

export async function initKanbanViewState(
  page: Page,
  config: {
    rows: string[];
    columns: { type: string; value?: unknown[] }[];
  },
  rootId?: string
) {
  const ids = await page.evaluate(
    async ({ rootId, config }) => {
      const { doc } = window;

      doc.captureSync();
      if (!rootId) {
        rootId = doc.addBlock('affine:page', {
          title: new window.$blocksuite.store.Text(),
        });
      }
      const noteId = doc.addBlock('affine:note', {}, rootId);
      const databaseId = doc.addBlock(
        'affine:database',
        {
          title: new window.$blocksuite.store.Text('Database 1'),
        },
        noteId
      );
      const model = doc.getModelById(databaseId) as DatabaseBlockModel;
      const datasource =
        new window.$blocksuite.blocks.database.DatabaseBlockDataSource(model);
      const rowIds = config.rows.map(rowText => {
        const rowId = doc.addBlock(
          'affine:paragraph',
          { type: 'text', text: new window.$blocksuite.store.Text(rowText) },
          databaseId
        );
        return rowId;
      });
      config.columns.forEach(column => {
        const columnId = datasource.propertyAdd('end', {
          type: column.type,
        });
        if (!columnId) {
          return;
        }
        datasource.propertyNameSet(columnId, column.type);
        rowIds.forEach((rowId, index) => {
          const value = column.value?.[index];
          if (value !== undefined) {
            datasource.cellValueChange(
              rowId,
              columnId,
              column.type === 'rich-text'
                ? new window.$blocksuite.store.Text(value as string)
                : value
            );
          }
        });
      });
      datasource.viewManager.viewAdd('kanban');
      doc.captureSync();
      return { rootId, noteId, databaseId };
    },
    { rootId, config }
  );
  return ids;
}

export async function initEmptyDatabaseWithParagraphState(
  page: Page,
  rootId?: string
) {
  const ids = await page.evaluate(async rootId => {
    const { doc } = window;
    doc.captureSync();
    if (!rootId) {
      rootId = doc.addBlock('affine:page', {
        title: new window.$blocksuite.store.Text(),
      });
    }
    const noteId = doc.addBlock('affine:note', {}, rootId);
    const databaseId = doc.addBlock(
      'affine:database',
      {
        title: new window.$blocksuite.store.Text('Database 1'),
      },
      noteId
    );
    const model = doc.getModelById(databaseId) as DatabaseBlockModel;
    const datasource =
      new window.$blocksuite.blocks.database.DatabaseBlockDataSource(model);
    datasource.viewManager.viewAdd('table');
    doc.addBlock('affine:paragraph', {}, noteId);
    doc.captureSync();
    return { rootId, noteId, databaseId };
  }, rootId);
  return ids;
}

export async function initDatabaseRow(page: Page) {
  const editorHost = getEditorHostLocator(page);
  const addRow = editorHost.locator('.data-view-table-group-add-row');
  await addRow.click();
}

export async function initDatabaseRowWithData(page: Page, data: string) {
  await initDatabaseRow(page);
  await waitNextFrame(page, 50);
  await type(page, data);
  await pressEscape(page);
}
export const getAddRow = (page: Page): Locator => {
  return page.locator('.data-view-table-group-add-row');
};
export async function initDatabaseDynamicRowWithData(
  page: Page,
  data: string,
  addRow = false,
  index = 0
) {
  const editorHost = getEditorHostLocator(page);
  if (addRow) {
    await initDatabaseRow(page);
    await waitNextFrame(page, 100);
    await pressEscape(page);
  }
  const lastRow = editorHost.locator('.affine-database-block-row').last();
  const cell = lastRow.locator('.database-cell').nth(index + 1);
  await cell.click();
  await waitNextFrame(page);
  await pressEnter(page);
  await waitNextFrame(page);
  await type(page, data);
  await waitNextFrame(page);
  await pressEnter(page);
}

export async function focusDatabaseTitle(page: Page) {
  const dbTitle = page.locator('[data-block-is-database-title="true"]');
  await dbTitle.click();

  await page.evaluate(() => {
    const dbTitle = document.querySelector(
      'affine-database-title textarea'
    ) as HTMLTextAreaElement | null;
    if (!dbTitle) {
      throw new Error('Cannot find database title');
    }

    dbTitle.focus();
  });
  await selectAllBlocksByKeyboard(page);
  await pressArrowRight(page);
  await waitNextFrame(page);
}

export async function assertDatabaseColumnOrder(page: Page, order: string[]) {
  const columns = await page
    .locator('affine-database-column-header')
    .locator('affine-database-header-column')
    .all();
  expect(await Promise.all(columns.slice(1).map(v => v.innerText()))).toEqual(
    order
  );
}

export async function initEmptyCodeBlockState(
  page: Page,
  codeBlockProps = {} as { language?: string }
) {
  const ids = await page.evaluate(codeBlockProps => {
    const { doc } = window;
    doc.captureSync();
    const rootId = doc.addBlock('affine:page');
    const noteId = doc.addBlock('affine:note', {}, rootId);
    const codeBlockId = doc.addBlock('affine:code', codeBlockProps, noteId);
    doc.captureSync();

    return { rootId, noteId, codeBlockId };
  }, codeBlockProps);
  await page.waitForSelector(`[data-block-id="${ids.codeBlockId}"] rich-text`);
  return ids;
}

type FocusRichTextOptions = {
  clickPosition?: { x: number; y: number };
};

export async function focusRichText(
  page: Page,
  i = 0,
  options?: FocusRichTextOptions
) {
  await page.mouse.move(0, 0);
  const editor = getEditorHostLocator(page);
  const locator = editor.locator(RICH_TEXT_SELECTOR).nth(i);
  // need to set `force` to true when clicking on `affine-selected-blocks`
  await locator.click({ force: true, position: options?.clickPosition });
}

export async function focusRichTextEnd(page: Page, i = 0) {
  await page.evaluate(
    ([i, currentEditorIndex]) => {
      const editorHost =
        document.querySelectorAll('editor-host')[currentEditorIndex];
      const richTexts = Array.from(editorHost.querySelectorAll('rich-text'));

      richTexts[i].inlineEditor?.focusEnd();
    },
    [i, currentEditorIndex]
  );
  await waitNextFrame(page);
}

export async function initThreeParagraphs(page: Page) {
  await focusRichText(page);
  await type(page, '123');
  await pressEnter(page);
  await type(page, '456');
  await pressEnter(page);
  await type(page, '789');
  await resetHistory(page);
}

export async function initSixParagraphs(page: Page) {
  await focusRichText(page);
  await type(page, '1');
  await pressEnter(page);
  await type(page, '2');
  await pressEnter(page);
  await type(page, '3');
  await pressEnter(page);
  await type(page, '4');
  await pressEnter(page);
  await type(page, '5');
  await pressEnter(page);
  await type(page, '6');
  await resetHistory(page);
}

export async function initThreeLists(page: Page) {
  await focusRichText(page);
  await type(page, '-');
  await pressSpace(page);
  await type(page, '123');
  await pressEnter(page);
  await type(page, '456');
  await pressEnter(page);
  await pressTab(page);
  await type(page, '789');
}

export async function insertThreeLevelLists(page: Page, i = 0) {
  await focusRichText(page, i);
  await type(page, '-');
  await pressSpace(page);
  await type(page, '123');
  await pressEnter(page);
  await pressTab(page);
  await type(page, '456');
  await pressEnter(page);
  await pressTab(page);
  await type(page, '789');
}

export async function initThreeDividers(page: Page) {
  await focusRichText(page);
  await type(page, '123');
  await pressEnter(page);
  await type(page, '---');
  await pressSpace(page);
  await type(page, '---');
  await pressSpace(page);
  await type(page, '---');
  await pressSpace(page);
  await type(page, '123');
}

export async function initParagraphsByCount(page: Page, count: number) {
  await focusRichText(page);
  for (let i = 0; i < count; i++) {
    await type(page, `paragraph ${i}`);
    await pressEnter(page);
  }
  await resetHistory(page);
}

export async function getInlineSelectionIndex(page: Page) {
  return page.evaluate(() => {
    const selection = window.getSelection() as Selection;

    const range = selection.getRangeAt(0);
    const component = range.startContainer.parentElement?.closest('rich-text');
    const index = component?.inlineEditor?.getInlineRange()?.index;
    return index !== undefined ? index : -1;
  });
}

export async function getInlineSelectionText(page: Page) {
  return page.evaluate(() => {
    const selection = window.getSelection() as Selection;
    const range = selection.getRangeAt(0);
    const component = range.startContainer.parentElement?.closest('rich-text');
    return component?.inlineEditor?.yText.toString() ?? '';
  });
}

export async function getSelectedTextByInlineEditor(page: Page) {
  return page.evaluate(() => {
    const selection = window.getSelection() as Selection;
    const range = selection.getRangeAt(0);
    const component = range.startContainer.parentElement?.closest('rich-text');

    const inlineRange = component?.inlineEditor?.getInlineRange();
    if (!inlineRange) return '';

    const { index, length } = inlineRange;
    return (
      component?.inlineEditor?.yText.toString().slice(index, index + length) ||
      ''
    );
  });
}

export async function getSelectedText(page: Page) {
  return page.evaluate(() => {
    let content = '';
    const selection = window.getSelection() as Selection;

    if (selection.rangeCount === 0) return content;

    const range = selection.getRangeAt(0);
    const components =
      range.commonAncestorContainer.parentElement?.querySelectorAll(
        'rich-text'
      ) || [];

    components.forEach(component => {
      const inlineRange = component.inlineEditor?.getInlineRange();
      if (!inlineRange) return;
      const { index, length } = inlineRange;
      content +=
        component?.inlineEditor?.yText
          .toString()
          .slice(index, index + length) || '';
    });

    return content;
  });
}

export async function setInlineRangeInSelectedRichText(
  page: Page,
  index: number,
  length: number
) {
  await page.evaluate(
    ({ index, length }) => {
      const selection = window.getSelection() as Selection;

      const range = selection.getRangeAt(0);
      const component =
        range.startContainer.parentElement?.closest('rich-text');
      component?.inlineEditor?.setInlineRange({
        index,
        length,
      });
    },
    { index, length }
  );
  await waitNextFrame(page);
}

export async function setInlineRangeInInlineEditor(
  page: Page,
  inlineRange: InlineRange,
  i = 0
) {
  await page.evaluate(
    ({ i, inlineRange }) => {
      const inlineEditor = document.querySelectorAll<InlineRootElement>(
        '[data-v-root="true"]'
      )[i]?.inlineEditor;
      if (!inlineEditor) {
        throw new Error('Cannot find inline editor');
      }
      inlineEditor.setInlineRange(inlineRange);
    },
    { i, inlineRange }
  );
  await waitNextFrame(page);
}

export async function pasteContent(
  page: Page,
  clipData: Record<string, unknown>
) {
  await page.evaluate(
    ({ clipData }) => {
      const e = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
      });
      Object.defineProperty(e, 'target', {
        writable: false,
        value: document,
      });
      Object.keys(clipData).forEach(key => {
        e.clipboardData?.setData(key, clipData[key] as string);
      });
      document.dispatchEvent(e);
    },
    { clipData }
  );
  await waitNextFrame(page);
}

export async function pasteTestImage(page: Page) {
  await page.evaluate(async () => {
    const resp = await fetch(`${location.origin}/test-card-1.png`);
    const blob = await resp.blob();
    const file = new File([blob], 'test-card-1.png', {
      type: 'image/png',
    });
    const e = new ClipboardEvent('paste', {
      clipboardData: new DataTransfer(),
    });

    Object.defineProperty(e, 'target', {
      writable: false,
      value: document,
    });

    e.clipboardData?.items.add(file);
    document.dispatchEvent(e);
  });
  await waitNextFrame(page);
}

export async function getClipboardHTML(page: Page) {
  const dataInClipboard = await page.evaluate(async () => {
    function format(node: HTMLElement, level: number) {
      const indentBefore = '  '.repeat(level++);
      const indentAfter = '  '.repeat(level >= 2 ? level - 2 : 0);
      let textNode;

      // eslint-disable-next-line @typescript-eslint/prefer-for-of
      for (let i = 0; i < node.children.length; i++) {
        textNode = document.createTextNode('\n' + indentBefore);
        node.insertBefore(textNode, node.children[i]);

        format(node.children[i] as HTMLElement, level);

        if (node.lastElementChild === node.children[i]) {
          textNode = document.createTextNode('\n' + indentAfter);
          node.append(textNode);
        }
      }

      return node;
    }
    const clipItems = await navigator.clipboard.read();
    const item = clipItems.find(item => item.types.includes('text/html'));
    const data = await item?.getType('text/html');
    const text = await data?.text();
    const html = new DOMParser().parseFromString(text ?? '', 'text/html');
    const container = html.querySelector<HTMLDivElement>(
      '[data-blocksuite-snapshot]'
    );
    if (!container) {
      return '';
    }
    return format(container, 0).innerHTML.trim();
  });

  return dataInClipboard;
}

export async function getClipboardText(page: Page) {
  const dataInClipboard = await page.evaluate(async () => {
    const clipItems = await navigator.clipboard.read();
    const item = clipItems.find(item => item.types.includes('text/plain'));
    const data = await item?.getType('text/plain');
    const text = await data?.text();
    return text ?? '';
  });
  return dataInClipboard;
}

export async function getClipboardCustomData(page: Page, type: string) {
  const dataInClipboard = await page.evaluate(async () => {
    const clipItems = await navigator.clipboard.read();
    const item = clipItems.find(item => item.types.includes('text/html'));
    const data = await item?.getType('text/html');
    const text = await data?.text();
    const html = new DOMParser().parseFromString(text ?? '', 'text/html');
    const container = html.querySelector<HTMLDivElement>(
      '[data-blocksuite-snapshot]'
    );
    return container?.dataset.blocksuiteSnapshot ?? '';
  });

  const decompressed = lz.decompressFromEncodedURIComponent(dataInClipboard);
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(decompressed);
  } catch {
    throw new Error(`Invalid snapshot in clipboard: ${dataInClipboard}`);
  }

  return json?.[type];
}

export async function getClipboardSnapshot(page: Page) {
  const dataInClipboard = await getClipboardCustomData(
    page,
    'BLOCKSUITE/SNAPSHOT'
  );
  if (!dataInClipboard) {
    throw new Error('dataInClipboard is not found');
  }
  const json = JSON.parse(dataInClipboard as string);
  return json;
}

export async function getPageSnapshot(page: Page, toJSON?: boolean) {
  const json = await page.evaluate(() => {
    const { job, doc } = window;
    const snapshot = job.docToSnapshot(doc);
    if (!snapshot) {
      throw new Error('Failed to get snapshot');
    }
    return snapshot.blocks;
  });
  if (toJSON) {
    return stringify(json, { space: '  ' });
  }
  return json;
}

export async function setSelection(
  page: Page,
  anchorBlockId: number,
  anchorOffset: number,
  focusBlockId: number,
  focusOffset: number
) {
  await page.evaluate(
    ({
      anchorBlockId,
      anchorOffset,
      focusBlockId,
      focusOffset,
      currentEditorIndex,
    }) => {
      const editorHost =
        document.querySelectorAll('editor-host')[currentEditorIndex];
      const anchorRichText = editorHost.querySelector<RichText>(
        `[data-block-id="${anchorBlockId}"] rich-text`
      )!;
      const anchorRichTextRange = anchorRichText.inlineEditor!.toDomRange({
        index: anchorOffset,
        length: 0,
      })!;
      const focusRichText = editorHost.querySelector<RichText>(
        `[data-block-id="${focusBlockId}"] rich-text`
      )!;
      const focusRichTextRange = focusRichText.inlineEditor!.toDomRange({
        index: focusOffset,
        length: 0,
      })!;

      const sl = getSelection();
      if (!sl) throw new Error('Cannot get selection');
      const range = document.createRange();
      range.setStart(
        anchorRichTextRange.startContainer,
        anchorRichTextRange.startOffset
      );
      range.setEnd(
        focusRichTextRange.startContainer,
        focusRichTextRange.startOffset
      );
      sl.removeAllRanges();
      sl.addRange(range);
    },
    {
      anchorBlockId,
      anchorOffset,
      focusBlockId,
      focusOffset,
      currentEditorIndex,
    }
  );
}

export async function readClipboardText(
  page: Page,
  type: 'input' | 'textarea' = 'input'
) {
  const id = 'clipboard-test';
  const selector = `#${id}`;
  await page.evaluate(
    ({ type, id }) => {
      const input = document.createElement(type);
      input.setAttribute('id', id);
      document.body.append(input);
    },
    { type, id }
  );
  const input = page.locator(selector);
  await input.focus();
  await page.keyboard.press(`${SHORT_KEY}+v`);
  const text = await input.inputValue();
  await page.evaluate(
    ({ selector }) => {
      const input = document.querySelector(selector);
      input?.remove();
    },
    { selector }
  );
  return text;
}

export const getCenterPositionByLocator: (
  page: Page,
  locator: Locator
) => Promise<{ x: number; y: number }> = async (
  _page: Page,
  locator: Locator
) => {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Failed to getCenterPosition! Can't get bounding box");
  }
  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
};

export async function getBoundingBox(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Missing column box');
  return box;
}

export async function getBlockModel<Model extends BlockModel>(
  page: Page,
  blockId: string
) {
  const result: BlockModel | null | undefined = await page.evaluate(blockId => {
    return window.doc?.getBlock(blockId)?.model;
  }, blockId);
  expect(result).not.toBeNull();
  return result as Model;
}

export async function getIndexCoordinate(
  page: Page,
  [richTextIndex, vIndex]: [number, number],
  coordOffSet: { x: number; y: number } = { x: 0, y: 0 }
) {
  const coord = await page.evaluate(
    ({ richTextIndex, vIndex, coordOffSet, currentEditorIndex }) => {
      const editorHost =
        document.querySelectorAll('editor-host')[currentEditorIndex];
      const richText = editorHost.querySelectorAll('rich-text')[
        richTextIndex
      ] as any;
      const domRange = richText.inlineEditor.toDomRange({
        index: vIndex,
        length: 0,
      });
      const pointBound = domRange.getBoundingClientRect();
      return {
        x: pointBound.left + coordOffSet.x,
        y: pointBound.top + pointBound.height / 2 + coordOffSet.y,
      };
    },
    {
      richTextIndex,
      vIndex,
      coordOffSet,
      currentEditorIndex,
    }
  );
  return coord;
}

export function inlineEditorInnerTextToString(innerText: string): string {
  return innerText.replace(ZERO_WIDTH_FOR_EMPTY_LINE, '').trim();
}

export async function focusTitle(page: Page) {
  await page.locator('doc-title rich-text').click();
  await page.evaluate(i => {
    const docTitle = document.querySelectorAll('doc-title')[i];
    if (!docTitle) {
      throw new Error('Doc title component not found');
    }
    const docTitleRichText = docTitle.querySelector('rich-text');
    if (!docTitleRichText) {
      throw new Error('Doc title rich text component not found');
    }
    if (!docTitleRichText.inlineEditor) {
      throw new Error('Doc title inline editor not found');
    }
    docTitleRichText.inlineEditor.focusEnd();
  }, currentEditorIndex);
  await waitNextFrame(page, 200);
}

/**
 * XXX: this is a workaround for the bug in Playwright
 */
export async function shamefullyBlurActiveElement(page: Page) {
  await page.evaluate(() => {
    if (
      !document.activeElement ||
      !(document.activeElement instanceof HTMLElement)
    ) {
      throw new Error("document.activeElement doesn't exist");
    }
    document.activeElement.blur();
  });
}

/**
 * FIXME:
 * Sometimes inline editor state is not updated in time. Bad case like below:
 *
 * ```
 * await focusRichText(page);
 * await type(page, 'hello');
 * await assertRichTexts(page, ['hello']);
 * ```
 *
 * output(failed or flaky):
 *
 * ```
 * - Expected  - 1
 * + Received  + 1
 *   Array [
 * -   "hello",
 * +   "ello",
 *   ]
 * ```
 *
 */
export async function waitForInlineEditorStateUpdated(page: Page) {
  return page.evaluate(async () => {
    const selection = window.getSelection() as Selection;

    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const component = range.startContainer.parentElement?.closest('rich-text');
    await component?.inlineEditor?.waitForUpdate();
  });
}

export async function initImageState(page: Page, prependParagraph = false) {
  await page.evaluate(async prepend => {
    const { doc } = window;
    const rootId = doc.addBlock('affine:page', {
      title: new window.$blocksuite.store.Text(),
    });
    const noteId = doc.addBlock('affine:note', {}, rootId);

    await new Promise(res => setTimeout(res, 200));

    const pageRoot = document.querySelector('affine-page-root');
    if (!pageRoot) throw new Error('Cannot find doc page');
    const imageBlob = await fetch(`${location.origin}/test-card-1.png`).then(
      response => response.blob()
    );
    const storage = pageRoot.store.blobSync;
    const sourceId = await storage.set(imageBlob);
    if (prepend) {
      doc.addBlock('affine:paragraph', {}, noteId);
    }
    const imageId = doc.addBlock(
      'affine:image',
      {
        sourceId,
      },
      noteId
    );

    doc.resetHistory();

    return { rootId, noteId, imageId };
  }, prependParagraph);

  // due to pasting img calls fetch, so we need timeout for downloading finished.
  await page.waitForTimeout(500);
}

export async function getCurrentEditorDocId(page: Page) {
  return page.evaluate(index => {
    const editor = document.querySelectorAll('affine-editor-container')[index];
    if (!editor) throw new Error("Can't find affine-editor-container");
    const docId = editor.doc.id;
    return docId;
  }, currentEditorIndex);
}

export async function getCurrentHTMLTheme(page: Page) {
  const root = page.locator('html');

  return root.getAttribute('data-theme');
}

export async function getCurrentEditorTheme(page: Page) {
  const mode = await page
    .locator('affine-editor-container')
    .first()
    .evaluate(() =>
      window
        .getComputedStyle(document.documentElement)
        .getPropertyValue('--affine-theme-mode')
        .trim()
    );
  return mode;
}

export async function getCurrentThemeCSSPropertyValue(
  page: Page,
  property: string
) {
  const value = await page
    .locator('affine-editor-container')
    .evaluate(
      (_, property) =>
        window
          .getComputedStyle(document.documentElement)
          .getPropertyValue(property)
          .trim(),
      property
    );
  return value;
}

export async function scrollToTop(page: Page) {
  await page.mouse.wheel(0, -1000);

  await page.waitForFunction(() => {
    const scrollContainer = document.querySelector('.affine-page-viewport');
    if (!scrollContainer) {
      throw new Error("Can't find scroll container");
    }
    return scrollContainer.scrollTop < 10;
  });
}

export async function scrollToBottom(page: Page) {
  // await page.mouse.wheel(0, 1000);

  await page
    .locator('.affine-page-viewport')
    .evaluate(node =>
      node.scrollTo({ left: 0, top: 1000, behavior: 'smooth' })
    );
  // TODO switch to `scrollend`
  // See https://developer.chrome.com/en/blog/scrollend-a-new-javascript-event/
  await page.waitForFunction(() => {
    const scrollContainer = document.querySelector('.affine-page-viewport');
    if (!scrollContainer) {
      throw new Error("Can't find scroll container");
    }

    return (
      // Wait for scrolled to the bottom
      // Refer to https://stackoverflow.com/questions/3898130/check-if-a-user-has-scrolled-to-the-bottom-not-just-the-window-but-any-element
      Math.abs(
        scrollContainer.scrollHeight -
          scrollContainer.scrollTop -
          scrollContainer.clientHeight
      ) < 10
    );
  });
}

export async function mockParseDocUrlService(
  page: Page,
  mapping: Record<string, string>
) {
  await page.evaluate(mapping => {
    const parseDocUrlService = window.host.std.get(
      window.$blocksuite.services.ParseDocUrlProvider
    );
    parseDocUrlService.parseDocUrl = (url: string) => {
      const docId = mapping[url];
      if (docId) {
        return { docId };
      }
      return;
    };
  }, mapping);
}
