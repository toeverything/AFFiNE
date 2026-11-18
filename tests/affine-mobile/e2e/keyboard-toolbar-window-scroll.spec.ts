import { test } from '@affine-test/kit/mobile';
import { expect } from '@playwright/test';

// Regression guard for keyboard-toolbar-window-scroll-bug: `root` used to be
// unbounded (`minHeight: 100dvh`), so `.affine-page-viewport` never had real
// internal overflow and `<html>`/`<body>` (the actual document) became the
// thing that scrolled instead whenever a doc's content exceeded one screen.
// On iOS, that document-level scroll is what dragged the keyboard toolbar's
// `position: fixed` host along with it (confirmed live via the
// mobile-debug-eval channel -- see mobile-detail-page.css.ts's `root` doc
// comment for the full writeup). This test encodes the structural
// invariant the fix establishes, independent of whether the keyboard is
// actually open: the document itself must never scroll; only
// `.affine-page-viewport` does.
//
// What this test CANNOT prove: the live, on-device WebKit rendering
// behavior (whether `position: fixed` visually jitters during real
// momentum-scroll touch gestures). That's a browser-compositor-level
// behavior no automated harness in this project has reliably reproduced
// for this bug class (see jasper-real-device-over-automated-test memory /
// prior sessions' findings on this exact area) -- this test instead proves
// the structural precondition for that WebKit bug (document-level
// overflow) is gone, which is the part that's actually fixable in our own
// code.

test.beforeEach(async ({ page }) => {
  const docsTab = page.locator('#app-tabs').getByRole('tab', { name: 'all' });
  await expect(docsTab).toBeVisible();
  await docsTab.click();
  await page.getByTestId('doc-list-item').first().click();
  await expect(page.locator('.affine-page-viewport')).toBeVisible();
});

test('document itself never scrolls -- only .affine-page-viewport does', async ({
  page,
}) => {
  const viewport = page.locator('.affine-page-viewport');

  const lastParagraph = page.locator('affine-paragraph').last();
  if (await lastParagraph.count()) {
    await lastParagraph.click();
  } else {
    await viewport.click();
  }

  // Enough lines that .affine-page-viewport genuinely overflows its own
  // bounded box on a typical mobile viewport (~600-900px tall).
  for (let i = 0; i < 40; i++) {
    await page.keyboard.type(`line ${i}`);
    await page.keyboard.press('Enter');
  }

  const viewportScrollHeight = await viewport.evaluate(el => el.scrollHeight);
  const viewportClientHeight = await viewport.evaluate(el => el.clientHeight);
  expect(
    viewportScrollHeight,
    '.affine-page-viewport should have real internal overflow once content exceeds its bounded height -- if this fails, root/editorContainer regressed back to being unbounded'
  ).toBeGreaterThan(viewportClientHeight);

  const documentScrollHeight = await page.evaluate(
    () => document.documentElement.scrollHeight
  );
  const documentClientHeight = await page.evaluate(
    () => document.documentElement.clientHeight
  );
  expect(
    documentScrollHeight,
    '<html> itself must stay bounded to the viewport -- it must never become the scroll container'
  ).toBeLessThanOrEqual(documentClientHeight + 1); // +1: sub-pixel rounding

  // Scroll the actual container the way a real gesture would end up
  // affecting it, and confirm the document itself never moves as a result.
  await viewport.evaluate(el => el.scrollTo({ top: 200, behavior: 'instant' }));
  const viewportScrollTopAfter = await viewport.evaluate(el => el.scrollTop);
  const documentScrollYAfter = await page.evaluate(() => window.scrollY);

  expect(viewportScrollTopAfter).toBeGreaterThan(0);
  expect(
    documentScrollYAfter,
    'window.scrollY must stay at 0 -- the document must never scroll, only .affine-page-viewport'
  ).toBe(0);
});
