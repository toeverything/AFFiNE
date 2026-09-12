import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { type, waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import type { CodeBlockComponent } from '@blocksuite/affine-block-code';
import { expect } from '@playwright/test';

import {
  createNewPage,
  gotoContentFromTitle,
  initCodeBlockByOneStep,
} from './utils';

test.describe('Code Block Autocomplete Operations', () => {
  test('angle brackets are not supported', async ({ page }) => {
    // open the home page and insert the code block
    await initCodeBlockByOneStep(page);
    await page.keyboard.type('<');
    const codeUnit = page.locator('affine-code-unit');
    await expect(codeUnit).toHaveText('<');
  });
});

test.describe('Code Block Language Selector', () => {
  test('search languages by display name, ID and alias regardless of case', async ({
    page,
  }) => {
    await initCodeBlockByOneStep(page);
    await page.locator('affine-code').hover({ position: { x: 155, y: 65 } });
    await page.getByTestId('lang-button').click();
    const languageList = page.locator('affine-filterable-list');

    for (const [query, label] of [
      ['AsSeMbLy', 'Assembly'],
      ['aSm', 'Assembly'],
      ['rS', 'Rust'],
    ]) {
      await page.getByPlaceholder('Search for a language').fill(query);
      await expect(
        languageList.getByRole('button', { name: label, exact: true })
      ).toBeVisible();
    }
  });

  test('keep plain text unhighlighted when a pending language load finishes', async ({
    page,
  }) => {
    await initCodeBlockByOneStep(page);
    await page.keyboard.type('const answer = 42;');
    const code = page.locator('affine-code');
    await expect
      .poll(() =>
        code.evaluate(
          (block: CodeBlockComponent) => !!block.highlighter.highlighter$.value
        )
      )
      .toBe(true);

    const result = await code.evaluate(async (block: CodeBlockComponent) => {
      const highlighter = block.highlighter.highlighter$.value!;
      const rust = block.langs.find(lang => lang.id === 'rust')!;
      await highlighter.loadLanguage(rust.import);

      // Use the real grammar but control when loading completes, without timers.
      const originalGetLoadedLanguages = highlighter.getLoadedLanguages;
      const originalLoadLanguage = highlighter.loadLanguage;
      let finishLoading!: () => void;
      let loadRequests = 0;
      const pendingLoad = new Promise<void>(resolve => {
        finishLoading = resolve;
      });
      try {
        highlighter.getLoadedLanguages = () => [];
        highlighter.loadLanguage = () => {
          loadRequests++;
          return pendingLoad;
        };
        block.model.props.language$.value = 'rust';
        block.model.props.language$.value = null;
        finishLoading();
        await pendingLoad;

        return {
          loadRequests,
          language: block.model.props.language,
          tokens: block.highlightTokens$.value,
        };
      } finally {
        highlighter.getLoadedLanguages = originalGetLoadedLanguages;
        highlighter.loadLanguage = originalLoadLanguage;
      }
    });
    expect(result.loadRequests).toBeGreaterThan(0);
    expect(result.language).toBeNull();
    expect(result.tokens).toEqual([]);
  });
});

test.describe('Code Block Preview', () => {
  test('enable html preview', async ({ page }) => {
    const code = page.locator('affine-code');

    await openHomePage(page);
    await createNewPage(page);
    await waitForEditorLoad(page);
    await gotoContentFromTitle(page);
    await type(page, '```html aaa');
    await code.hover({
      position: {
        x: 155,
        y: 65,
      },
    });
    await page.getByText('Preview').click();
    await expect(
      page
        .locator('iframe[title="HTML Preview"]')
        .contentFrame()
        .getByText('aaa')
    ).toBeVisible();
  });

  test('enable mermaid preview', async ({ page }) => {
    const code = page.locator('affine-code');
    const mermaidSvg = page.locator('mermaid-preview .mermaid-preview-svg svg');

    await openHomePage(page);
    await createNewPage(page);
    await waitForEditorLoad(page);
    await gotoContentFromTitle(page);
    await type(page, '```mermaid graph TD;A-->B');
    await code.hover({
      position: {
        x: 155,
        y: 65,
      },
    });
    await page.getByText('Preview').click();
    await expect(mermaidSvg).toBeVisible();
  });

  test('enable typst preview', async ({ page }) => {
    const code = page.locator('affine-code');
    const typstPreview = page.locator('typst-preview');

    await openHomePage(page);
    await createNewPage(page);
    await waitForEditorLoad(page);
    await gotoContentFromTitle(page);
    await type(page, '```typst = Title');
    await code.hover({
      position: {
        x: 155,
        y: 65,
      },
    });
    await page.getByText('Preview').click();
    await expect(typstPreview).toBeVisible();
  });

  test('change lang without preview', async ({ page }) => {
    const code = page.locator('affine-code');
    const preview = page.locator('affine-code .affine-code-block-preview');

    await openHomePage(page);
    await createNewPage(page);
    await waitForEditorLoad(page);
    await gotoContentFromTitle(page);
    await type(page, '```html aaa');

    await code.hover({
      position: {
        x: 155,
        y: 65,
      },
    });
    await page.getByText('Preview').click();
    await expect(preview).toBeVisible();

    // change to lang without preview support
    await page.getByTestId('lang-button').click();
    await page.getByRole('button', { name: 'ABAP' }).click();

    await expect(preview).toBeHidden();

    // change back to html
    await page.getByTestId('lang-button').click();
    await page.getByRole('button', { name: 'HTML', exact: true }).click();

    await expect(preview).toBeVisible();
  });
});
