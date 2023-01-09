import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page.js';

loadPage();

test.describe('web console', () => {
  // TODO: playwright need to support json import in esm
  test.skip('editor version', async ({ page }) => {
    // TODO: playwright need to support json import in esm
    // const pkg = await import('./../packages/app/package.json', {
    //   assert: { type: 'json' },
    // });
    const pkg = {} as any;

    // https://playwright.dev/docs/evaluating
    // https://github.com/microsoft/playwright/issues/13059
    // Get the handle to a specific function.
    //Later on, call this function with some arguments.
    // const msg = await getEditoVersionHandle.evaluate((post, args) => post);
    // console.log(getEditoVersionHandle);
    const editoVersion = await page.evaluate(() => window.__editoVersion);
    // const documentEditorVersion = await page.inputValue('input#editor-version');
    const pkgEditorVersion = pkg.dependencies['@blocksuite/editor'];

    expect(editoVersion).toBe(pkgEditorVersion);
  });
});
