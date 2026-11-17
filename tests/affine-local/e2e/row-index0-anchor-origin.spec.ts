import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Locator, type Page, test } from '@playwright/test';

// Regression suite for: "in a List view row title, whenever the selection
// includes the FIRST character, Backspace / Delete / typing a replacement all
// silently fail to modify the row."
// See .planning/debug/row-index0-selection-delete.md.
//
// THE REPORTED BOUNDARY IS NOT THE REAL ONE. "Includes index 0" is a consequence
// of the actual trigger, not the trigger. The real discriminating variable is
// where the selection is ANCHORED:
//
//   anchor INSIDE the title's inline root  -> works
//   anchor OUTSIDE it (the row's leading   -> browser emits NO `beforeinput` at
//   gutter: drag handle / indent spacer /      all, so Backspace, Delete AND
//   task-status checkbox)                      typing are all swallowed whole
//
// The two are indistinguishable from the user's side because the leading gutter
// is the only thing that sits left of character 0: you can only begin a drag
// there when index 0 ends up in the selection. That is why the previous 26-case
// differential matrix (`row-index0-selection.spec.ts`) passes 17/17 on chromium
// and 10/10 on WebKit while the bug is real -- every selection it builds is
// anchored in-root by construction (`dragSelect` starts at `textBox.x + 1`,
// `dblclickWord` at `textBox.x + 12`, and the keyboard helpers use `Home` /
// `Shift+ArrowLeft`).
//
// MEASURED, not argued: with an out-of-root anchor the event log for a Backspace
// is `keydown` and nothing else -- no `beforeinput`, no `input`. With an in-root
// anchor it is `keydown -> beforeinput -> (delete applied)`. The cell is fully
// editable in both cases (`isReadonly: false`, `isEditing: true`), so "the drag
// knocked the cell out of edit mode" is excluded.
//
// The contract this file enforces is therefore a GESTURE contract: no real drag
// begun anywhere across the row's leading gutter may leave the selection
// anchored outside the inline root. The browser rule that punishes such a
// selection is pinned separately, in the `mechanism` tests at the bottom, so a
// future reader can see why the gesture assertions matter.

test.describe.configure({ mode: 'default' });

const TEXT = 'alpha beta';
const SLOW = 60_000;

test.describe('List view row: selection begun in the row leading gutter', () => {
  test.beforeEach(async ({ page }) => {
    await openHomePage(page);
    await clickNewPageButton(page);
    await waitForEditorLoad(page);
    await page.keyboard.press('Enter');
    await insertListView(page);
  });

  // One offset per test on a FRESH page, never several offsets on one page:
  // row order is not stable across typing (`ensureTodoListRow` reorders rows on
  // focusin and on every keydown), so a `.last()`-bound locator can resolve to a
  // different row after typing. Doing this the cheap way produced a fused
  // "betaalpha beta" row that looks like a dramatic product bug and is entirely
  // the harness.
  //
  // Offsets are relative to the LEFT EDGE OF THE FIRST CHARACTER (see
  // `dragFromOffset`). Measured layout of a real row, which these bands follow:
  // drag handle 476-488, task-status checkbox 488-504, dead gap 504-512, first
  // glyph at 512.
  //   +4 / +1  -- inside the text; the only shapes the old matrix ever produced.
  //   -2 / -6  -- the 8px dead gap in front of the text. THE REPORTED BUG.
  //   -12/-24  -- on the checkbox, and -36 on the drag handle: row chrome, where
  //               NOT making a text selection is correct. They are boundary
  //               neighbours, held to the weaker invariant below so that a fix
  //               which merely relocates the out-of-root anchor is still caught.
  for (const off of [4, 1, -2, -6, -12, -24, -36]) {
    const label = off > 0 ? `+${off}` : `${off}`;
    const isRowChrome = off <= -12;

    test(`drag begun ${label}px from the text's left edge`, async ({
      page,
    }) => {
      const row = await addRowAndType(page, TEXT);
      await instrument(row);
      await dragFromOffset(page, row, off);

      const probe = await probeSelection(row);
      logProbe(`offset ${label}`, probe);

      // The cell must still be editable, or nothing below means anything. This
      // excludes the benign "the drag knocked it out of editing mode" reading.
      expect(probe.isReadonly, 'inline editor must still be editable').toBe(
        false
      );
      expect(probe.isEditing, 'cell must still be in editing mode').toBe(
        'true'
      );

      // INVARIANT 1, held at EVERY offset including the row-chrome ones. A
      // selection anchored outside the inline root is un-editable by
      // construction: the browser will not emit `beforeinput` for it, so every
      // keystroke dies silently. No drag begun anywhere over this row may leave
      // one behind. Having NO selection is fine here; having an unusable one is
      // not -- that is the whole defect.
      expect(
        probe.hasRange && !probe.startInRoot,
        `drag begun at ${label}px left a selection anchored OUTSIDE the title's ` +
          `inline root (${probe.anchorNode}), which silently disables all editing`
      ).toBe(false);

      if (isRowChrome) {
        // On the checkbox / drag handle the gesture is row chrome, not text
        // selection. Invariant 1 above is the whole assertion for these.
        return;
      }

      // INVARIANT 1b -- inside the text and in the gap directly in front of it,
      // the drag must actually produce a usable selection.
      expect(
        probe.startInRoot,
        `drag begun at ${label}px produced no usable in-root selection ` +
          `(anchor: ${probe.anchorNode || 'none'})`
      ).toBe(true);

      await page.keyboard.press('Backspace');
      await page.waitForTimeout(400);
      const log = await readInstrument(row);
      const after = stripPlaceholders(await row.innerText());
      console.log(
        `RESULT offset=${label} changed=${after !== TEXT} beforeinput=${firedBeforeInput(log)} after=${JSON.stringify(after)}`
      );

      // INVARIANT 2 -- the broken link itself, asserted directly rather than
      // through a proxy. `beforeinput` is the ONLY channel through which the
      // inline editor applies any edit.
      expect(
        firedBeforeInput(log),
        `no \`beforeinput\` was emitted for the Backspace at ${label}px -- the ` +
          `keystroke never reached the editor at all`
      ).toBe(true);

      // INVARIANT 3 -- the user-visible outcome.
      expect(
        after,
        `Backspace after a drag begun at ${label}px did not modify the row`
      ).not.toBe(TEXT);
    });
  }

  // Delete and typing share `beforeinput` with Backspace, so they fail and
  // recover together -- but the user reported all three, so all three are held.
  for (const action of ['Delete', 'type'] as const) {
    test(`drag begun -4px from the text's left edge | ${action}`, async ({
      page,
    }) => {
      const row = await addRowAndType(page, TEXT);
      await instrument(row);
      await dragFromOffset(page, row, -4);
      const probe = await probeSelection(row);
      logProbe(`offset -4 | ${action}`, probe);
      expect(probe.startInRoot, 'anchor must be inside the inline root').toBe(
        true
      );
      if (action === 'type') {
        await page.keyboard.type('X');
      } else {
        await page.keyboard.press('Delete');
      }
      await page.waitForTimeout(400);
      const log = await readInstrument(row);
      expect(firedBeforeInput(log), 'beforeinput must be emitted').toBe(true);
      await expect(row).not.toHaveText(TEXT);
    });
  }
});

// ---------------------------------------------------------------------------
// MECHANISM. These pin the browser rule that makes the gesture contract above
// matter, by building the DOM range by hand instead of gesturing for it.
//
// They are CHARACTERISATION tests, not acceptance tests: they describe how the
// browser behaves, which no change in this repo can alter. They must keep
// passing after the fix -- the fix stops the gesture from ever producing this
// range, it does not (and cannot) make the range work.
//
// CHROMIUM ONLY, and that restriction is itself a finding. Running this file
// under `playwright.webkit.config.ts` showed all nine GESTURE cases passing but
// this one failing: WebKit DOES emit `beforeinput` for a range anchored outside
// the editable host, where chromium emits nothing. So the silent-swallow rule is
// engine-specific, which independently corroborates the rest of the
// investigation -- it is exactly why the reported bug never reproduced on WebKit
// no matter how the selection was built, and it places the reporter on a
// Chromium-based browser (Chrome / Edge / the Electron desktop build).
// The gesture contract above is engine-independent and runs on both.
// ---------------------------------------------------------------------------
test.describe('List view row: why an out-of-root anchor is fatal', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Characterises a Chromium-specific rule: WebKit emits beforeinput for an ' +
      'out-of-root-anchored range, chromium emits none. Measured, not assumed.'
  );

  test.beforeEach(async ({ page }) => {
    await openHomePage(page);
    await clickNewPageButton(page);
    await waitForEditorLoad(page);
    await page.keyboard.press('Enter');
    await insertListView(page);
  });

  test('mechanism | out-of-root anchor emits NO beforeinput', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await instrument(row);
    const built = await buildRange(row, 'out-of-root');
    console.log('BUILT:', JSON.stringify(built));
    const probe = await probeSelection(row);
    logProbe('mechanism out-of-root', probe);
    expect(probe.startInRoot).toBe(false);
    expect(probe.endInRoot).toBe(true);
    expect(
      probe.isReadonly,
      'still editable -- this is not a readonly cell'
    ).toBe(false);
    expect(probe.inlineRange, 'the range is unresolvable').toBe('null');

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(400);
    const log = await readInstrument(row);
    console.log('EVENT LOG:', JSON.stringify(log));
    expect(firedBeforeInput(log), 'browser emits no beforeinput').toBe(false);
    await expect(row, 'and so the row is untouched').toHaveText(TEXT);
  });

  test('mechanism | in-root anchor over the same characters DOES emit beforeinput', async ({
    page,
  }) => {
    const row = await addRowAndType(page, TEXT);
    await instrument(row);
    const built = await buildRange(row, 'in-root');
    console.log('BUILT:', JSON.stringify(built));
    const probe = await probeSelection(row);
    logProbe('mechanism in-root', probe);
    expect(probe.startInRoot).toBe(true);
    expect(probe.inlineRange).toBe('{"index":0,"length":5}');

    await page.keyboard.press('Backspace');
    await page.waitForTimeout(400);
    const log = await readInstrument(row);
    console.log('EVENT LOG:', JSON.stringify(log));
    expect(firedBeforeInput(log)).toBe(true);
    await expect(row).not.toHaveText(TEXT);
  });
});

// ---------------------------------------------------------------- helpers

type Probe = Awaited<ReturnType<typeof probeSelection>>;
type LogEntry = { tag?: string; type?: string; inputType?: string };

function firedBeforeInput(log: LogEntry[]) {
  return log.some(e => e.type === 'beforeinput');
}

function logProbe(label: string, probe: Probe) {
  console.log(`--- PROBE [${label}]`);
  for (const [k, v] of Object.entries(probe)) {
    console.log(`      ${k}: ${JSON.stringify(v)}`);
  }
}

/**
 * Installs capture-phase recorders for keydown / beforeinput / input, and wraps
 * the editor's `toInlineRange` so every conversion attempt and its result show
 * up in the same ordered log.
 */
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
      for (let i = 0; i < 5 && cur; i++) {
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
    };
  });
}

/**
 * Builds a DOM selection by hand covering inline indices 0..5 of the row title.
 *
 * `in-root`     -- anchor on the title's own first text node at offset 0.
 * `out-of-root` -- anchor on a non-editable decoration that precedes the inline
 *                  root (task-status checkbox, else the cell element itself).
 * Same covered characters either way; only the anchor's origin differs.
 */
async function buildRange(row: Locator, mode: 'in-root' | 'out-of-root') {
  return row.evaluate((el: HTMLElement, mode: 'in-root' | 'out-of-root') => {
    const rt = el.querySelector('rich-text') as
      | (HTMLElement & { inlineEditor?: Record<string, any> })
      | null;
    const root: HTMLElement | undefined = rt?.inlineEditor?.rootElement;
    if (!root) return { ok: false, why: 'no inline root' };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode() as Text | null;
    if (!first) return { ok: false, why: 'no text node in root' };

    const range = document.createRange();
    if (mode === 'in-root') {
      range.setStart(first, 0);
    } else {
      const outside =
        (el.querySelector(
          '[data-testid="task-status-checkbox"]'
        ) as HTMLElement | null) ??
        (el.querySelector(
          'data-view-header-area-text'
        ) as HTMLElement | null) ??
        el;
      range.setStart(outside, 0);
    }
    range.setEnd(first, Math.min(5, first.length));
    const sel = document.getSelection();
    if (!sel) return { ok: false, why: 'no selection object' };
    sel.removeAllRanges();
    sel.addRange(range);
    return { ok: true, mode, covers: sel.toString() };
  }, mode);
}

/**
 * Drags from `offset` px relative to THE LEFT EDGE OF THE FIRST CHARACTER, into
 * the text.
 *
 * Measured against the first glyph, deliberately, and not against the
 * rich-text element's own box: part of the fix hands the 8px dead gap in front
 * of the text to the rich-text (negative margin + equal padding), which moves
 * that element's left edge while the glyphs stay exactly where they were. An
 * offset measured from the element would silently point at a different place
 * before and after the fix, and the whole suite would be comparing two
 * different experiments. The first character's left edge does not move, and it
 * is also the thing the user is actually aiming at.
 */
async function dragFromOffset(page: Page, row: Locator, offset: number) {
  const charLeft = await row.evaluate((el: HTMLElement) => {
    const rt = el.querySelector('rich-text') as
      | (HTMLElement & { inlineEditor?: Record<string, any> })
      | null;
    const root: HTMLElement | undefined = rt?.inlineEditor?.rootElement;
    if (!root) return null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode() as Text | null;
    if (!first || first.length === 0) return null;
    const r = document.createRange();
    r.setStart(first, 0);
    r.setEnd(first, 1);
    const box = r.getBoundingClientRect();
    return { x: box.x, y: box.y + box.height / 2 };
  });
  if (!charLeft) throw new Error('could not locate the first character');
  await page.mouse.move(charLeft.x + offset, charLeft.y);
  await page.mouse.down();
  await page.mouse.move(charLeft.x + 45, charLeft.y, { steps: 10 });
  await page.mouse.up();
}

function stripPlaceholders(s: string) {
  // Alternation, not a character class: `no-misleading-character-class`
  // rejects a zero-width-joiner inside a class.
  return s.replace(/\u200B|\u200C|\u200D|\uFEFF/g, '').trim();
}

async function insertListView(page: Page) {
  await page.keyboard.type('/List View');
  await page
    .getByText('List View', { exact: true })
    .first()
    .click({ timeout: SLOW });
  await expect(page.locator('affine-database').first()).toBeVisible({
    timeout: SLOW,
  });
}

async function addRowAndType(page: Page, text: string) {
  const rows = page.locator('.affine-data-view-list-row[data-row-id]');
  const countBefore = await rows.count();
  await page.locator('.new-record').first().click();
  await expect(rows).toHaveCount(countBefore + 1);
  const title = rows.last().locator('.affine-data-view-list-title');
  await title.click();
  await page.keyboard.type(text);
  await expect(title).toHaveText(text);
  const rowId = await rows.last().getAttribute('data-row-id');
  return page
    .locator(`.affine-data-view-list-row[data-row-id="${rowId}"]`)
    .locator('.affine-data-view-list-title');
}
