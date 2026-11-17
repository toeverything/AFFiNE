import { skipOnboarding } from '@affine-test/kit/playwright';
import {
  confirmCreateJournal,
  openHomePage,
} from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect, type Locator, type Page, test } from '@playwright/test';

// Journal Todo arm of .planning/debug/row-index0-selection-delete.md.
//
// The whole of that session -- including its accepted fix's own regression
// suite (row-index0-anchor-origin.spec.ts) -- was run against a PLAIN, same-page
// List view. Jasper's literal repro goes through Journal -> auto-today ->
// Journal Todo, which is a CROSS-DOC `database-view-ref`: the rows are rendered
// by the same components, but inside `DatabaseViewRefPreviewRootBlockComponent`
// and its nested `BlockStdScope`, which in this project has already been found
// to diverge from the outer page three separate times.
//
// This file is deliberately diagnostic-first: it MEASURES the Journal Todo
// row (does the fix's CSS apply here at all? are the leading decorations the
// same, in the same order?) before asserting anything, because the plain-List
// arm of this investigation already burned one "deterministic reproduction"
// that turned out to be a defective oracle.
//
// MUST be run with --workers=1: parallel workers starve the shared dev server
// and produce uniform false failures inside setup that look exactly like a
// total reproduction. Already recorded as a harness mode in the debug file.

test.describe.configure({ mode: 'serial' });

const SLOW = 60_000;

test.describe('Journal Todo row: select-all + Backspace', () => {
  let page: Page;

  test.beforeAll(async ({ browser, browserName }) => {
    // Firefox and WebKit both reject `clipboard-read`/`clipboard-write` as
    // unknown permission names (`browser.newContext: Unknown permission:
    // clipboard-read`) -- measured directly, not assumed, the same way the
    // sibling `playwright.webkit.config.ts` already had to discover this.
    // This file's own tests never touch the clipboard, so the grant is only
    // ever needed (and only ever valid) on chromium.
    const context = await browser.newContext({
      viewport: { width: 1440, height: 800 },
      permissions:
        browserName === 'chromium' ? ['clipboard-read', 'clipboard-write'] : [],
    });
    await context.addInitScript(() => {
      window.addEventListener('DOMContentLoaded', () => {
        document.body.classList.add('playwright-test');
      });
    });
    await skipOnboarding(context);
    page = await context.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  // Jasper's literal step 1 needs a journal that opens ONTO a Journal Todo,
  // which means the workspace journal template must already contain one. Same
  // three-step setup journal-todo-cross-doc.spec.ts uses, for the same reason.
  test('setup: canonical Journal Todo + journal template that references it', async (// oxlint-disable-next-line no-empty-pattern
  {}, testInfo) => {
    testInfo.setTimeout(120_000);
    await openHomePage(page);
    await dismissOpenInAppBannerIfShown(page);

    await page.getByTestId('sidebar-new-page-button').click();
    await waitForEditorLoad(page);
    await page.keyboard.type('Journal Todo Source');
    await page.keyboard.press('Enter');
    await insertJournalTodo(page);

    await page.getByTestId('sidebar-new-page-button').click();
    await waitForEditorLoad(page);
    await page.keyboard.type('Journal Template');
    await page.keyboard.press('Enter');
    await insertJournalTodo(page);
    await markCurrentDocAsTemplate(page);

    const journalTemplateDocId = await getDocId(page);
    expect(journalTemplateDocId).toBeTruthy();

    await page.getByTestId('slider-bar-workspace-setting-button').click();
    await page.getByTestId('workspace-setting:preference').click();
    await page.getByTestId('journal-template-selector').click();
    await page.getByTestId(`template-doc-item-${journalTemplateDocId}`).click();
    await page.getByTestId('modal-close-button').click();
  });

  test('open the auto-today journal (Jasper step 1)', async (// oxlint-disable-next-line no-empty-pattern
  {}, testInfo) => {
    testInfo.setTimeout(90_000);
    await page.getByTestId('slider-bar-journals-button').click();
    await confirmCreateJournal(page);
    await waitForEditorLoad(page);
    await expect(page.locator('affine-database-view-ref').first()).toBeVisible({
      timeout: SLOW,
    });
    // Cross-doc canonical resolution is asynchronous (duplicate-middleware).
    await page.waitForTimeout(2000);
    await expect(page.locator('.new-record').first()).toBeVisible({
      timeout: SLOW,
    });
  });

  // D1 + D2 -- pure measurement, no product assertion. Answers, for a REAL
  // Journal Todo row: does the accepted fix's CSS apply here, and is the DOM
  // the same shape as the plain List view this file's fix was validated on?
  test('DIAGNOSTIC: fix CSS application + row structure inside the nested preview scope', async (// oxlint-disable-next-line no-empty-pattern
  {}, testInfo) => {
    testInfo.setTimeout(90_000);
    const row = await addRowAndType(page, 'alpha beta');

    const dump = await row.evaluate((el: HTMLElement) => {
      const cs = (n: Element | null, prop: string) =>
        n ? getComputedStyle(n).getPropertyValue(prop) : 'NO-ELEMENT';
      const rowEl = el.closest('.affine-data-view-list-row') as HTMLElement;
      const handle = rowEl?.querySelector('.affine-data-view-list-drag-handle');
      const spacer = rowEl?.querySelector(
        '.affine-data-view-list-indent-spacer'
      );
      const checkbox = rowEl?.querySelector(
        '[data-testid="task-status-checkbox"]'
      );
      const rt = el.querySelector('rich-text');
      const vRoot = el.querySelector('[data-v-root]');

      // Walk up from the row looking for ANY shadow boundary between it and
      // the document -- the concrete hypothesis flagged in the debug file.
      const shadowRoots: string[] = [];
      let node: Node | null = rowEl;
      while (node) {
        const rootNode = node.getRootNode();
        if (rootNode instanceof ShadowRoot) {
          shadowRoots.push((rootNode.host as Element).tagName.toLowerCase());
          node = rootNode.host;
        } else {
          break;
        }
      }

      // Geometry sweep across the leading band, the same measurement that
      // originally located the 8px dead gap on a plain List view.
      const sweep: string[] = [];
      let firstCharX: number | null = null;
      const root = (rt as unknown as { inlineEditor?: Record<string, any> })
        ?.inlineEditor?.rootElement as HTMLElement | undefined;
      if (root) {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const first = walker.nextNode() as Text | null;
        if (first && first.length > 0) {
          const r = document.createRange();
          r.setStart(first, 0);
          r.setEnd(first, 1);
          const box = r.getBoundingClientRect();
          firstCharX = box.x;
          const y = box.y + box.height / 2;
          for (let off = -40; off <= 6; off += 2) {
            const hit = document.elementFromPoint(box.x + off, y);
            const cls = String((hit as HTMLElement)?.className ?? '').trim();
            sweep.push(
              `${off >= 0 ? '+' : ''}${off}: ${hit?.tagName?.toLowerCase()}${cls ? `.${cls.split(/\s+/)[0]}` : ''}`
            );
          }
        }
      }

      const rect = (n: Element | null) => {
        if (!n) return 'NO-ELEMENT';
        const b = n.getBoundingClientRect();
        return `${Math.round(b.x)}..${Math.round(b.right)}`;
      };

      return {
        shadowBoundaries: shadowRoots,
        firstCharX,
        userSelect: {
          dragHandle: cs(handle, 'user-select'),
          indentSpacer: cs(spacer, 'user-select'),
          taskCheckbox: cs(checkbox, 'user-select'),
        },
        gapFix: {
          richTextMarginLeft: cs(rt, 'margin-left'),
          vRootPaddingLeft: cs(vRoot, 'padding-left'),
          checkboxHasDataTitleLeading: checkbox
            ? Object.hasOwn((checkbox as HTMLElement).dataset, 'titleLeading')
            : 'NO-ELEMENT',
        },
        rects: {
          dragHandle: rect(handle),
          indentSpacer: rect(spacer),
          taskCheckbox: rect(checkbox),
          richText: rect(rt),
          vRoot: rect(vRoot),
        },
        leadingChildOrder: rowEl
          ? Array.from(rowEl.children).map(
              c =>
                `${c.tagName.toLowerCase()}.${String(c.className).trim().split(/\s+/)[0] ?? ''}`
            )
          : [],
        titleChildOrder: Array.from(el.children).map(
          c =>
            `${c.tagName.toLowerCase()}.${String(c.className).trim().split(/\s+/)[0] ?? ''}`
        ),
        hitTestSweep: sweep,
        rowOuterHTML: rowEl?.outerHTML.slice(0, 2500),
      };
    });

    console.log('=== D1/D2 JOURNAL TODO ROW DIAGNOSTIC ===');
    console.log(JSON.stringify(dump, null, 2));
  });

  // D3 -- Jasper's literal gesture. "Select ALL the text of a row" is ambiguous
  // in the report and the plausible readings are materially DIFFERENT
  // mechanisms, so they are measured side by side rather than one being
  // assumed. Each case records the event log and the selection state BOTH
  // before and after the Backspace: he reports the text visibly UNSELECTS while
  // staying unchanged, and "collapsed but unchanged" vs "still selected and
  // unchanged" are different failures that must not be conflated.
  //
  // The DIRECTION and FAR END of a mouse selection are new axes. Everything
  // this file has measured so far -- in the plain List view arm too -- dragged
  // LEFT-TO-RIGHT and stopped inside the text. A user selecting a whole row by
  // dragging right-to-left, or overshooting past the row's edge, produces a DOM
  // range whose out-of-root endpoint is a different one, which the Chromium
  // no-`beforeinput` rule this file already characterised would punish just the
  // same.
  const GESTURES = [
    'ctrl-a',
    'triple-click',
    'dbl-click-first-word',
    'drag-lr-gap',
    'drag-lr-checkbox',
    'drag-lr-handle',
    'drag-lr-outside-row',
    'drag-rl-to-gap',
    'drag-rl-to-handle',
    'drag-rl-outside-row',
    'shift-home',
    'shift-arrowleft-all',
    'shift-end-from-gap',
  ] as const;

  for (const gesture of GESTURES) {
    test(`fresh row | select via ${gesture} | Backspace`, async (// oxlint-disable-next-line no-empty-pattern
    {}, testInfo) => {
      testInfo.setTimeout(90_000);
      await runCase(page, gesture, 'fresh');
    });
  }

  // Jasper's flow is "add rows with text" and THEN select -- not "select while
  // the caret is still where typing left it". Re-entering the cell re-runs the
  // cell's own editing bootstrap, which in this nested cross-doc scope is
  // exactly the kind of thing this project has already seen diverge.
  for (const gesture of GESTURES) {
    test(`re-entered row | select via ${gesture} | Backspace`, async (// oxlint-disable-next-line no-empty-pattern
    {}, testInfo) => {
      testInfo.setTimeout(90_000);
      await runCase(page, gesture, 're-entered');
    });
  }
});

type Gesture =
  | 'ctrl-a'
  | 'triple-click'
  | 'dbl-click-first-word'
  | 'drag-lr-gap'
  | 'drag-lr-checkbox'
  | 'drag-lr-handle'
  | 'drag-lr-outside-row'
  | 'drag-rl-to-gap'
  | 'drag-rl-to-handle'
  | 'drag-rl-outside-row'
  | 'shift-home'
  | 'shift-arrowleft-all'
  | 'shift-end-from-gap';

async function runCase(
  page: Page,
  gesture: Gesture,
  entry: 'fresh' | 're-entered'
) {
  const text = `sel ${gesture}`;
  const row = await addRowAndType(page, text);

  if (entry === 're-entered') {
    // Leave the cell entirely, then come back. Escape rather than clicking
    // another row, so this does not accidentally also vary "which row was
    // focused last" -- one axis at a time.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const g0 = await geometry(row);
    await page.mouse.click(g0.lastCharRight + 10, g0.y);
    await page.waitForTimeout(300);
  }

  await instrument(row);
  const g = await geometry(row);
  await applyGesture(page, row, gesture, g, text.length);
  await page.waitForTimeout(250);

  const before = await probeSelection(row);
  logProbe(`${gesture} | ${entry} | BEFORE`, before);

  await page.keyboard.press('Backspace');
  await page.waitForTimeout(500);

  const after = await probeSelection(row);
  const log = await readInstrument(row);
  const now = stripPlaceholders(await row.innerText());
  logProbe(`${gesture} | ${entry} | AFTER`, after);
  console.log(`EVENT LOG [${gesture}|${entry}]:`, JSON.stringify(log));
  console.log(
    `RESULT [${gesture}|${entry}] changed=${now !== text} ` +
      `selectedBefore=${JSON.stringify(before.selectedText)} ` +
      `startInRoot=${before.startInRoot} endInRoot=${before.endInRoot} ` +
      `after=${JSON.stringify(now)}`
  );

  // The invariant, stated so a PASS is informative and a FAIL is diagnosed
  // rather than merely counted: if the gesture produced a real non-collapsed
  // selection in an editable cell, Backspace MUST modify the row. A gesture
  // that produced no selection at all (row chrome doing its own job) proves
  // nothing either way and is recorded, not asserted.
  if (!before.hasRange || before.collapsed || before.selectedText === '') {
    console.log(
      `NOTE [${gesture}|${entry}] produced no usable selection -- not asserted`
    );
    return;
  }
  expect(before.isReadonly, 'cell must still be editable').toBe(false);
  expect(
    now,
    `Backspace over a real selection (${JSON.stringify(before.selectedText)}) ` +
      `left the row unchanged`
  ).not.toBe(text);
}

async function geometry(row: Locator) {
  const g = await row.evaluate((el: HTMLElement) => {
    const rt = el.querySelector('rich-text') as
      | (HTMLElement & { inlineEditor?: Record<string, any> })
      | null;
    const root: HTMLElement | undefined = rt?.inlineEditor?.rootElement;
    if (!root) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode() as Text | null;
    let first: Text | null = null;
    let last: Text | null = null;
    while (node) {
      if (node.length > 0) {
        first ??= node;
        last = node;
      }
      node = walker.nextNode() as Text | null;
    }
    if (!first || !last) return null;
    const r1 = document.createRange();
    r1.setStart(first, 0);
    r1.setEnd(first, 1);
    const b1 = r1.getBoundingClientRect();
    const r2 = document.createRange();
    r2.setStart(last, last.length - 1);
    r2.setEnd(last, last.length);
    const b2 = r2.getBoundingClientRect();
    const rowEl = el.closest('.affine-data-view-list-row') as HTMLElement;
    return {
      firstCharX: b1.x,
      lastCharRight: b2.right,
      y: b1.y + b1.height / 2,
      rowLeft: rowEl.getBoundingClientRect().x,
    };
  });
  if (!g) throw new Error('could not measure the row geometry');
  return g;
}

type Geometry = Awaited<ReturnType<typeof geometry>>;

async function drag(page: Page, fromX: number, toX: number, y: number) {
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  await page.mouse.move(toX, y, { steps: 12 });
  await page.mouse.up();
}

async function applyGesture(
  page: Page,
  row: Locator,
  gesture: Gesture,
  g: Geometry,
  textLength: number
) {
  switch (gesture) {
    case 'ctrl-a':
      await page.keyboard.press('ControlOrMeta+a');
      return;
    case 'triple-click':
      await row.click({ clickCount: 3 });
      return;
    case 'dbl-click-first-word':
      await page.mouse.dblclick(g.firstCharX + 4, g.y);
      return;
    case 'drag-lr-gap':
      await drag(page, g.firstCharX - 4, g.lastCharRight + 10, g.y);
      return;
    case 'drag-lr-checkbox':
      await drag(page, g.firstCharX - 14, g.lastCharRight + 10, g.y);
      return;
    case 'drag-lr-handle':
      await drag(page, g.firstCharX - 30, g.lastCharRight + 10, g.y);
      return;
    case 'drag-lr-outside-row':
      await drag(page, g.rowLeft - 20, g.lastCharRight + 10, g.y);
      return;
    case 'drag-rl-to-gap':
      await drag(page, g.lastCharRight + 10, g.firstCharX - 4, g.y);
      return;
    case 'drag-rl-to-handle':
      await drag(page, g.lastCharRight + 10, g.firstCharX - 30, g.y);
      return;
    case 'drag-rl-outside-row':
      await drag(page, g.lastCharRight + 10, g.rowLeft - 20, g.y);
      return;
    case 'shift-home':
      await page.mouse.click(g.lastCharRight + 10, g.y);
      await page.keyboard.press('Shift+Home');
      return;
    case 'shift-arrowleft-all':
      await page.mouse.click(g.lastCharRight + 10, g.y);
      for (let i = 0; i < textLength; i++) {
        await page.keyboard.press('Shift+ArrowLeft');
      }
      return;
    case 'shift-end-from-gap':
      await page.mouse.click(g.firstCharX - 4, g.y);
      await page.keyboard.press('Shift+End');
      return;
  }
}

// ---------------------------------------------------------------- helpers

type Probe = Awaited<ReturnType<typeof probeSelection>>;
type LogEntry = { tag?: string; type?: string; inputType?: string };

function logProbe(label: string, probe: Probe) {
  console.log(`--- PROBE [${label}]`);
  for (const [k, v] of Object.entries(probe)) {
    console.log(`      ${k}: ${JSON.stringify(v)}`);
  }
}

async function instrument(row: Locator) {
  await row.evaluate((el: HTMLElement) => {
    const w = window as unknown as { __ev?: unknown[] };
    w.__ev = [];
    const push = (entry: unknown) => w.__ev!.push(entry);
    const rec =
      (tag: string) => (e: Event & { inputType?: string; key?: string }) => {
        push({
          tag,
          type: e.type,
          inputType: e.inputType,
          key: e.key,
          defaultPrevented: e.defaultPrevented,
        });
      };
    document.addEventListener('keydown', rec('keydown(capture)'), true);
    document.addEventListener('beforeinput', rec('beforeinput(capture)'), true);
    document.addEventListener('input', rec('input(capture)'), true);

    const rt = el.querySelector('rich-text') as
      | (HTMLElement & { inlineEditor?: Record<string, any> })
      | null;
    const ie = rt?.inlineEditor;
    if (ie && typeof ie.toInlineRange === 'function') {
      const orig = ie.toInlineRange.bind(ie);
      ie.toInlineRange = (r: Range) => {
        const out = orig(r);
        push({ tag: 'toInlineRange', result: JSON.stringify(out) });
        return out;
      };
    }
  });
}

async function readInstrument(row: Locator): Promise<LogEntry[]> {
  return row.evaluate(
    () => (window as unknown as { __ev?: LogEntry[] }).__ev ?? []
  ) as Promise<LogEntry[]>;
}

async function probeSelection(row: Locator) {
  return row.evaluate((el: HTMLElement) => {
    const rt = el.querySelector('rich-text') as
      | (HTMLElement & {
          inlineEditor?: Record<string, any>;
          readonly?: boolean;
        })
      | null;
    const ie = rt?.inlineEditor;
    const root: HTMLElement | undefined = ie?.rootElement;
    const cell = el.querySelector('data-view-header-area-text') as
      | (HTMLElement & { isEditing$?: { value?: boolean } })
      | null;
    const sel = document.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    const chain = (n: Node | null | undefined): string => {
      const parts: string[] = [];
      let cur: Node | null | undefined = n;
      for (let i = 0; i < 6 && cur; i++) {
        if (cur.nodeType === Node.TEXT_NODE) {
          parts.push(`#text(${JSON.stringify(cur.textContent)})`);
        } else {
          const e = cur as Element;
          const cls = String((e as HTMLElement).className ?? '').trim();
          parts.push(`${e.tagName?.toLowerCase()}${cls ? `.${cls}` : ''}`);
        }
        cur = cur.parentNode;
      }
      return parts.join(' < ');
    };
    let inlineRange = 'n/a';
    try {
      inlineRange = JSON.stringify(ie?.getInlineRange?.() ?? null);
    } catch (e) {
      inlineRange = `THREW ${String(e)}`;
    }
    const inRoot = (n: Node | undefined | null) =>
      !!(root && n && (n === root || root.contains(n)));
    return {
      hasRange: !!range,
      collapsed: range?.collapsed,
      selectedText: sel?.toString() ?? '',
      anchorNode: chain(range?.startContainer),
      anchorOffset: range?.startOffset,
      focusNode: chain(range?.endContainer),
      focusOffset: range?.endOffset,
      startInRoot: inRoot(range?.startContainer),
      endInRoot: inRoot(range?.endContainer),
      inlineRange,
      isReadonly: !!ie?.isReadonly,
      richTextReadonly: !!rt?.readonly,
      isEditing: String(cell?.isEditing$?.value),
      rootFound: !!root,
      activeElement: `${document.activeElement?.tagName?.toLowerCase()}`,
    };
  });
}

function stripPlaceholders(s: string) {
  return s.replace(/​|‌|‍|﻿/g, '').trim();
}

async function insertJournalTodo(page: Page) {
  await page.keyboard.type('/Journal Todo');
  await page.getByText('Journal Todo', { exact: true }).first().click();
  await expect(page.locator('affine-database-view-ref').first()).toBeVisible({
    timeout: SLOW,
  });
}

function getTemplateRow(page: Page) {
  return page.locator(
    '[data-testid="doc-property-row"][data-info-id="template"]'
  );
}

async function toggleTemplate(row: Locator, value: boolean) {
  const checkbox = row.locator('input[type="checkbox"]');
  const state = await checkbox.inputValue();
  const checked = state === 'on';
  if (checked !== value) {
    await checkbox.click();
  }
}

async function markCurrentDocAsTemplate(page: Page) {
  const collapse = page.getByTestId('page-info-collapse');
  const open = await collapse.getAttribute('aria-expanded');
  if (open?.toLowerCase() !== 'true') {
    await collapse.click();
  }

  if ((await getTemplateRow(page).count()) === 0) {
    const addPropertyButton = page.getByTestId('add-property-button');
    if (!(await addPropertyButton.isVisible())) {
      await page.getByTestId('property-collapsible-button').click();
    }
    await addPropertyButton.click();
    await page
      .locator('[role="menuitem"][data-property-type="journal"]')
      .click();
    await page.keyboard.press('Escape');
  } else if (!(await getTemplateRow(page).isVisible())) {
    await page.getByTestId('property-collapsible-button').click();
  }

  const templateRow = getTemplateRow(page);
  await expect(templateRow).toBeVisible();
  await toggleTemplate(templateRow, true);

  await page.locator('affine-note').first().click();
}

async function getDocId(page: Page) {
  return page.evaluate(() => {
    const url = window.location.href;
    return url.split('/').pop()?.split('?')[0];
  });
}

async function dismissOpenInAppBannerIfShown(page: Page) {
  const dismiss = page
    .getByTestId('open-in-app-card')
    .getByRole('button', { name: /dismiss/i });
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await dismiss.isVisible().catch(() => false)) {
      await dismiss.focus();
      await page.keyboard.press('Enter');
      const stillThere = await dismiss.isVisible().catch(() => false);
      if (!stillThere) return;
    }
    await page.waitForTimeout(250);
  }
}

// Binds the new row by IDENTITY (set-difference of data-row-id before/after
// the click), never by position.
//
// `.last()` is wrong here and measurably so: the plain List view arm of this
// investigation already recorded that row order is not stable across typing
// (`ensureTodoListRow` reorders on focusin and on every keydown), and in
// Journal Todo it is worse still -- the first attempt at this suite typed into
// the PREVIOUS row and produced a fused "alpha betagest ctrl-a" title, i.e. a
// newly created row is not necessarily last at all in this view. An
// id-bound locator is correct regardless of where the row sits or moves to.
async function addRowAndType(page: Page, text: string) {
  const rows = page.locator('.affine-data-view-list-row[data-row-id]');
  const idsBefore = new Set(
    await rows.evaluateAll(els =>
      els.map(e => (e as HTMLElement).dataset.rowId ?? '')
    )
  );
  await page.locator('.new-record').first().click();
  await expect(rows).toHaveCount(idsBefore.size + 1);

  const newId = await page.evaluate(
    known => {
      const all = Array.from(
        document.querySelectorAll('.affine-data-view-list-row[data-row-id]')
      ).map(e => (e as HTMLElement).dataset.rowId ?? '');
      return all.find(id => !known.includes(id)) ?? null;
    },
    [...idsBefore]
  );
  if (!newId) throw new Error('could not identify the newly created row');

  const title = page
    .locator(`.affine-data-view-list-row[data-row-id="${newId}"]`)
    .locator('.affine-data-view-list-title');
  await title.click();
  await page.keyboard.type(text);
  await expect(title).toHaveText(text);
  return title;
}
