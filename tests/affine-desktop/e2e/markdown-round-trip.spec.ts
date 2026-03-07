/**
 * T082-T084 — Markdown round-trip fidelity E2E tests.
 *
 * Verifies that all net-new formatting types survive export → import with no
 * visible degradation beyond SC-008 tolerance (trailing newlines, blank-line
 * count). Uses source mode as the serialisation/deserialisation gateway.
 *
 * Per contracts §6 / SC-008.
 */
import { test } from '@affine-test/kit/electron';
import { clickNewPageButton } from '@affine-test/kit/utils/page-logic';
import { expect, type Page } from '@playwright/test';

async function enterSourceMode(page: Page) {
  const toggle = page.getByTestId('source-mode-toggle');
  await expect(toggle).toBeVisible({ timeout: 5000 });
  await toggle.click();
  await expect(page.getByTestId('source-mode-textarea')).toBeVisible();
}

async function exitSourceMode(page: Page) {
  await page.getByTestId('source-mode-apply-button').click();
  await expect(page.getByTestId('source-mode-editor')).not.toBeVisible();
}

// ── T082: Net-new types round-trip ──────────────────────────────────────────

test('T082: bold round-trip via source mode', async ({ page }) => {
  await clickNewPageButton(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('Hello ');

  // Use source mode to inject bold markdown.
  await enterSourceMode(page);
  const textarea = page.getByTestId('source-mode-textarea');
  const md = await textarea.inputValue();
  await textarea.fill(md + '\n**bold text**');
  await exitSourceMode(page);

  // Re-enter source mode to verify the bold survived.
  await enterSourceMode(page);
  const after = await page.getByTestId('source-mode-textarea').inputValue();
  expect(after).toContain('**bold text**');
  await page.getByTestId('source-mode-cancel-button').click();
});

test('T082: obsidian comment round-trip via source mode', async ({ page }) => {
  await clickNewPageButton(page);
  await enterSourceMode(page);
  const textarea = page.getByTestId('source-mode-textarea');
  await textarea.fill('%%hidden comment%%\n\nVisible text.');
  await exitSourceMode(page);

  await enterSourceMode(page);
  const after = await page.getByTestId('source-mode-textarea').inputValue();
  // Comment should survive round-trip (trimmed form acceptable per SC-008)
  expect(after).toContain('%%hidden comment%%');
  expect(after).toContain('Visible text.');
  await page.getByTestId('source-mode-cancel-button').click();
});

test('T082: callout round-trip via source mode', async ({ page }) => {
  await clickNewPageButton(page);
  await enterSourceMode(page);
  const textarea = page.getByTestId('source-mode-textarea');
  await textarea.fill('> [!NOTE]\n> This is a callout body.');
  await exitSourceMode(page);

  await enterSourceMode(page);
  const after = await page.getByTestId('source-mode-textarea').inputValue();
  expect(after).toContain('[!NOTE]');
  expect(after).toContain('callout body');
  await page.getByTestId('source-mode-cancel-button').click();
});

// ── T083: "verify + wire" types round-trip ───────────────────────────────────

test('T083: fenced code block with language id round-trip', async ({
  page,
}) => {
  await clickNewPageButton(page);
  await enterSourceMode(page);
  const textarea = page.getByTestId('source-mode-textarea');
  await textarea.fill('```typescript\nconst x: number = 42;\n```');
  await exitSourceMode(page);

  await enterSourceMode(page);
  const after = await page.getByTestId('source-mode-textarea').inputValue();
  expect(after).toContain('typescript');
  expect(after).toContain('const x');
  await page.getByTestId('source-mode-cancel-button').click();
});

test('T083: GFM table round-trip', async ({ page }) => {
  await clickNewPageButton(page);
  await enterSourceMode(page);
  const textarea = page.getByTestId('source-mode-textarea');
  await textarea.fill(
    '| Col A | Col B |\n|-------|-------|\n| one   | two   |'
  );
  await exitSourceMode(page);

  await enterSourceMode(page);
  const after = await page.getByTestId('source-mode-textarea').inputValue();
  // Column headers and at least one row must survive.
  expect(after).toContain('Col A');
  expect(after).toContain('Col B');
  expect(after).toContain('one');
  await page.getByTestId('source-mode-cancel-button').click();
});

test('T083: task list round-trip preserves checkbox states', async ({
  page,
}) => {
  await clickNewPageButton(page);
  await enterSourceMode(page);
  const textarea = page.getByTestId('source-mode-textarea');
  await textarea.fill('- [x] Done item\n- [ ] Pending item');
  await exitSourceMode(page);

  await enterSourceMode(page);
  const after = await page.getByTestId('source-mode-textarea').inputValue();
  expect(after).toContain('[x]');
  expect(after).toContain('Done item');
  expect(after).toContain('Pending item');
  await page.getByTestId('source-mode-cancel-button').click();
});

test('T083: mermaid diagram survives round-trip syntactically', async ({
  page,
}) => {
  await clickNewPageButton(page);
  await enterSourceMode(page);
  const textarea = page.getByTestId('source-mode-textarea');
  await textarea.fill('```mermaid\ngraph TD\n  A --> B\n```');
  await exitSourceMode(page);

  await enterSourceMode(page);
  const after = await page.getByTestId('source-mode-textarea').inputValue();
  expect(after).toContain('mermaid');
  expect(after).toContain('A --> B');
  await page.getByTestId('source-mode-cancel-button').click();
});

test('T083: math block normalised to $$ round-trip', async ({ page }) => {
  await clickNewPageButton(page);
  await enterSourceMode(page);
  const textarea = page.getByTestId('source-mode-textarea');
  await textarea.fill('$$\nx = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\n$$');
  await exitSourceMode(page);

  await enterSourceMode(page);
  const after = await page.getByTestId('source-mode-textarea').inputValue();
  expect(after).toContain('$$');
  expect(after).toContain('frac');
  await page.getByTestId('source-mode-cancel-button').click();
});

test('T083: autolink URL preserved byte-for-byte', async ({ page }) => {
  await clickNewPageButton(page);
  await enterSourceMode(page);
  const textarea = page.getByTestId('source-mode-textarea');
  const url = 'https://affine.pro/blog/article?q=test&page=1';
  await textarea.fill(`See ${url} for details.`);
  await exitSourceMode(page);

  await enterSourceMode(page);
  const after = await page.getByTestId('source-mode-textarea').inputValue();
  expect(after).toContain(url);
  await page.getByTestId('source-mode-cancel-button').click();
});

// ── T084: Empty/degenerate blocks ────────────────────────────────────────────

test('T084: callout with no body not omitted on round-trip', async ({
  page,
}) => {
  await clickNewPageButton(page);
  await enterSourceMode(page);
  const textarea = page.getByTestId('source-mode-textarea');
  await textarea.fill('> [!WARNING]');
  await exitSourceMode(page);

  await enterSourceMode(page);
  const after = await page.getByTestId('source-mode-textarea').inputValue();
  expect(after).toContain('[!WARNING]');
  await page.getByTestId('source-mode-cancel-button').click();
});

test('T084: empty task list item not omitted on round-trip', async ({
  page,
}) => {
  await clickNewPageButton(page);
  await enterSourceMode(page);
  const textarea = page.getByTestId('source-mode-textarea');
  await textarea.fill('- [ ] ');
  await exitSourceMode(page);

  await enterSourceMode(page);
  const after = await page.getByTestId('source-mode-textarea').inputValue();
  // Accepts either "- [ ]" or "- [ ] " — trailing whitespace SC-008 tolerance
  expect(after).toMatch(/- \[ \]/);
  await page.getByTestId('source-mode-cancel-button').click();
});
