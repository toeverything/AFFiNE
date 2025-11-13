import { toolbarButtons } from '@affine-test/kit/bs/linked-toolbar';
import { waitNextFrame } from '@affine-test/kit/bs/misc';
import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  locateToolbar,
} from '@affine-test/kit/utils/editor';
import {
  pasteByKeyboard,
  pressArrowUp,
  pressBackspace,
  pressEnter,
  selectAllByKeyboard,
  writeTextToClipboard,
} from '@affine-test/kit/utils/keyboard';
import { coreUrl, openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  createLinkedPage,
  createTodayPage,
  getBlockSuiteEditorTitle,
  type,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import {
  confirmExperimentalPrompt,
  openEditorSetting,
  openExperimentalFeaturesPanel,
} from '@affine-test/kit/utils/setting';
import { expect, type Locator, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);
});

async function enableEmojiDocIcon(page: Page) {
  // Opens settings panel
  await openEditorSetting(page);
  await openExperimentalFeaturesPanel(page);
  await confirmExperimentalPrompt(page);

  const settingModal = page.locator('[data-testid=setting-modal-content]');
  const item = settingModal.locator('div').getByText('Emoji Doc Icon');
  await item.waitFor({ state: 'attached' });
  await expect(item).toBeVisible();
  const button = item.locator('label');
  const isChecked = await button.locator('input').isChecked();
  if (!isChecked) {
    await button.click();
  }

  // Closes settings panel
  await page.keyboard.press('Escape');
}

async function notClickable(locator: Locator) {
  await expect(locator).toHaveAttribute('disabled', '');
}

async function clickable(locator: Locator) {
  await expect(locator).not.toHaveAttribute('disabled', '');
}

test('not allowed to switch to embed view when linking to the same document', async ({
  page,
}) => {
  await page.keyboard.press('Enter');

  const url0 = new URL(page.url());

  await writeTextToClipboard(page, url0.toString());

  const { toolbar, switchViewBtn, inlineViewBtn, cardViewBtn, embedViewBtn } =
    toolbarButtons(page);

  // Inline
  const inlineLink = page.locator('affine-reference');

  await inlineLink.hover();
  await switchViewBtn.click();

  await notClickable(inlineViewBtn);
  await clickable(cardViewBtn);
  await notClickable(embedViewBtn);

  // Switches to card view
  await cardViewBtn.click();

  // Card
  const cardLink = page.locator('affine-embed-linked-doc-block');
  await expect(cardLink).toBeVisible();

  await cardLink.click();
  // In the test environment, a text selection update is triggered, which is very unstable.
  await cardLink.click();

  await expect(toolbar).toBeVisible();
  await switchViewBtn.click();

  await clickable(inlineViewBtn);
  await notClickable(cardViewBtn);
  await notClickable(embedViewBtn);

  await cardLink.dblclick();

  const peekViewModel = page.getByTestId('peek-view-modal');
  await expect(peekViewModel).toBeVisible();
  await expect(peekViewModel.locator('page-editor')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(peekViewModel).not.toBeVisible();
  await page.click('body');
});

test('not allowed to switch to embed view when linking to block', async ({
  page,
}) => {
  await page.keyboard.press('Enter');
  await createLinkedPage(page, 'Test Page');

  const { toolbar, switchViewBtn, inlineViewBtn, cardViewBtn, embedViewBtn } =
    toolbarButtons(page);

  // Inline
  const inlineLink = page.locator('affine-reference');

  await inlineLink.hover();
  await switchViewBtn.click();

  await notClickable(inlineViewBtn);
  await clickable(cardViewBtn);
  await clickable(embedViewBtn);

  // Switches to card view
  await cardViewBtn.click();

  // Card
  const cardLink = page.locator('affine-embed-linked-doc-block');

  await cardLink.dblclick();

  const peekViewModel = page.getByTestId('peek-view-modal');
  await expect(peekViewModel).toBeVisible();
  await expect(peekViewModel.locator('page-editor')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(peekViewModel).not.toBeVisible();

  await cardLink.click();

  await toolbar.getByLabel('More menu').click();
  await toolbar.getByLabel('Copy link to block').click();

  await page.keyboard.press('Enter');
  await pasteByKeyboard(page);

  await expect(inlineLink).toBeVisible();
  const href0 = await inlineLink.locator('a').getAttribute('href');

  await inlineLink.hover();
  await switchViewBtn.click();

  await notClickable(inlineViewBtn);
  await clickable(cardViewBtn);
  await notClickable(embedViewBtn);

  // Switches to card view
  await cardViewBtn.click();

  const otherCardLink = page.locator('affine-embed-linked-doc-block').nth(1);
  await otherCardLink.dblclick();

  await expect(peekViewModel).toBeVisible();
  await expect(peekViewModel.locator('page-editor')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(peekViewModel).not.toBeVisible();

  await page.click('body');
  await otherCardLink.click();
  await switchViewBtn.click();

  await clickable(inlineViewBtn);
  await notClickable(cardViewBtn);
  await notClickable(embedViewBtn);

  // Switches to inline view
  await inlineViewBtn.click();

  const href1 = await inlineLink.locator('a').getAttribute('href');

  expect(href0).not.toBeNull();
  expect(href1).not.toBeNull();

  const url0 = new URL(href0!, coreUrl);
  const url1 = new URL(href1!, coreUrl);

  url0.searchParams.delete('refreshKey');
  url1.searchParams.delete('refreshKey');
  expect(url0.toJSON()).toStrictEqual(url1.toJSON());
});

test('allow switching to embed view when linking to the other document without mode', async ({
  page,
}) => {
  await page.keyboard.press('Enter');
  await createLinkedPage(page, 'Test Page');

  const { switchViewBtn, inlineViewBtn, cardViewBtn, embedViewBtn } =
    toolbarButtons(page);

  // Inline
  const inlineLink = page.locator('affine-reference');

  await inlineLink.hover();
  await switchViewBtn.click();

  await notClickable(inlineViewBtn);
  await clickable(cardViewBtn);
  await clickable(embedViewBtn);

  // Switches to card view
  await cardViewBtn.click();

  // Card
  const cardLink = page.locator('affine-embed-linked-doc-block');
  await expect(cardLink).toBeVisible();

  await cardLink.click();
  await cardLink.click();

  await switchViewBtn.click();

  await clickable(inlineViewBtn);
  await notClickable(cardViewBtn);
  await clickable(embedViewBtn);

  // Switches to embed view
  await embedViewBtn.click();

  // Embed
  const embedLink = page.locator('affine-embed-synced-doc-block');
  await expect(embedLink).toBeVisible();

  await embedLink.click();
  await embedLink.click();

  await switchViewBtn.click();

  await clickable(inlineViewBtn);
  await clickable(cardViewBtn);
  await notClickable(embedViewBtn);

  // Closes
  await switchViewBtn.click();
  await expect(
    page.locator('.affine-embed-synced-doc-container.page')
  ).toBeVisible();

  await embedLink.click();
  await embedLink.click();

  await switchViewBtn.click();

  await clickable(inlineViewBtn);
  await clickable(cardViewBtn);
  await notClickable(embedViewBtn);

  // Switches to card view
  await cardViewBtn.click();

  await cardLink.click();
  await cardLink.click();

  await switchViewBtn.click();
  await clickable(inlineViewBtn);
  await notClickable(cardViewBtn);
  await clickable(embedViewBtn);

  // Switches to inline view
  await inlineViewBtn.click();

  await expect(inlineLink).toBeVisible();
});

test('allow switching to embed view when linking to the other document with mode', async ({
  page,
}) => {
  await page.keyboard.press('Enter');
  await createLinkedPage(page, 'Test Page');

  const url = new URL(page.url());
  url.searchParams.append('mode', 'edgeless');

  const { switchViewBtn, inlineViewBtn, cardViewBtn, embedViewBtn } =
    toolbarButtons(page);

  const inlineLink = page.locator('affine-reference');

  await inlineLink.click();

  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');

  await writeTextToClipboard(page, url.toString());

  // Inline
  await inlineLink.hover();
  await switchViewBtn.click();

  await notClickable(inlineViewBtn);
  await clickable(cardViewBtn);
  await clickable(embedViewBtn);

  // Switches to card view
  await cardViewBtn.click();

  // Card
  const cardLink = page.locator('affine-embed-linked-doc-block');
  await expect(cardLink).toBeVisible();

  // refocus
  await cardLink.click();
  await switchViewBtn.click();

  await clickable(inlineViewBtn);
  await notClickable(cardViewBtn);
  await clickable(embedViewBtn);

  // Switches to embed view
  await embedViewBtn.click();

  // Embed
  const embedLink = page.locator('affine-embed-synced-doc-block');
  await expect(embedLink).toBeVisible();

  // refocus
  await embedLink.click();
  await switchViewBtn.click();

  await clickable(inlineViewBtn);
  await clickable(cardViewBtn);
  await notClickable(embedViewBtn);

  // Closes
  await switchViewBtn.click();
  await expect(
    page.locator('.affine-embed-synced-doc-container.edgeless')
  ).toBeVisible();

  // refocus
  await embedLink.click();

  await switchViewBtn.click();

  await clickable(inlineViewBtn);
  await clickable(cardViewBtn);
  await notClickable(embedViewBtn);

  // Switches to card view
  await cardViewBtn.click();

  await cardLink.click();
  await switchViewBtn.click();

  await clickable(inlineViewBtn);
  await notClickable(cardViewBtn);
  await clickable(embedViewBtn);

  // Switches to inline view
  await inlineViewBtn.click();

  await inlineLink.click();

  // Checks the url
  const url2 = new URL(page.url());
  url2.searchParams.delete('refreshKey');
  expect(url.toJSON()).toStrictEqual(url2.toJSON());
});

test('@ popover should show today menu item', async ({ page }) => {
  await page.keyboard.press('Enter');
  await waitForEmptyEditor(page);
  await page.keyboard.press('@');
  await expect(page.locator('.linked-doc-popover')).toBeVisible();
  const todayMenuItem = page.locator('.linked-doc-popover').getByText('Today');
  await expect(todayMenuItem).toBeVisible();

  const textContent = await todayMenuItem.locator('span').textContent();
  await todayMenuItem.click();
  const date = textContent?.trim();

  // a affine-reference should be created with name date
  await expect(
    page.locator('affine-reference:has-text("' + date + '")')
  ).toBeVisible();
});

test('@ popover with input=tmr', async ({ page }) => {
  await page.keyboard.press('Enter');
  await waitForEmptyEditor(page);
  await page.keyboard.press('@');
  await page.keyboard.type('tmr');
  await expect(page.locator('.linked-doc-popover')).toBeVisible();
  const tomorrowMenuItem = page
    .locator('.linked-doc-popover')
    .getByText('Tomorrow');
  await expect(tomorrowMenuItem).toBeVisible();

  const textContent = await tomorrowMenuItem.locator('span').textContent();
  await tomorrowMenuItem.click();

  // a affine-reference should be created with name date
  await expect(
    page.locator('affine-reference:has-text("' + textContent + '")')
  ).toBeVisible();
});

test('@ popover with input=dec should create a reference with a December date', async ({
  page,
}) => {
  await page.keyboard.press('Enter');
  await waitForEmptyEditor(page);
  await page.keyboard.press('@');
  await page.keyboard.type('dc');

  const decemberMenuItem = page.locator(
    '.linked-doc-popover icon-button:has-text("Dec")'
  );
  await expect(decemberMenuItem).toBeVisible();

  const textContent = await decemberMenuItem
    .locator('.text-container')
    .textContent();
  await decemberMenuItem.click();

  // a affine-reference should be created with name date
  await expect(
    page.locator('affine-reference:has-text("' + textContent + '")')
  ).toBeVisible();
});

test('@ popover with click "select a specific date" should show a date picker', async ({
  page,
}) => {
  await page.keyboard.press('Enter');
  await waitForEmptyEditor(page);
  await page.keyboard.press('@');

  const todayMenuItem = page.locator('.linked-doc-popover').getByText('Today');
  await expect(todayMenuItem).toBeVisible();

  const textContent = await todayMenuItem.locator('span').textContent();
  const date = textContent?.trim();

  await page.locator('icon-button:has-text("Select a specific date")').click();
  await expect(
    page.locator('[data-is-date-cell][data-is-today=true]')
  ).toBeVisible();
  await page.locator('[data-is-date-cell][data-is-today=true]').click();

  // a affine-reference should be created with name date
  await expect(
    page.locator('affine-reference:has-text("' + date + '")')
  ).toBeVisible();
});

test('@ popover can auto focus on the "New Doc" item when query returns no items', async ({
  page,
}) => {
  await page.keyboard.press('Enter');
  await waitForEmptyEditor(page);
  await page.keyboard.press('@');
  await page.keyboard.type('nawowenni');
  await expect(page.locator('.linked-doc-popover')).toBeVisible();
  const newDocMenuItem = page
    .locator('.linked-doc-popover')
    .locator('[data-id="create:page"]');
  await expect(newDocMenuItem).toBeVisible();
  await expect(newDocMenuItem).toHaveAttribute('hover', 'true');
});

test('linked doc should show markdown preview in the backlink section', async ({
  page,
}) => {
  await waitForEmptyEditor(page);
  await page.keyboard.type('source page');
  await page.keyboard.press('Enter');

  await page.keyboard.type('some inline content');
  await page.keyboard.press('Enter');

  await createLinkedPage(page, 'Test Page');
  await page.locator('affine-reference:has-text("Test Page")').click();

  await expect(getBlockSuiteEditorTitle(page)).toHaveText('Test Page');
  await page
    .getByRole('button', {
      name: 'Show',
    })
    .click();

  await page.getByRole('button', { name: 'source page' }).click();

  await expect(page.locator('text-renderer')).toContainText(
    'some inline content'
  );
  await expect(page.locator('text-renderer')).toContainText('Test Page');
});

test('the viewport should be fit when the linked document is with edgeless mode', async ({
  page,
}) => {
  await page.keyboard.press('Enter');

  await clickEdgelessModeButton(page);

  const note = page.locator('affine-edgeless-note');
  const noteBoundingBox = await note.boundingBox();
  expect(noteBoundingBox).not.toBeNull();
  if (!noteBoundingBox) return;

  // move viewport
  const { x, y } = noteBoundingBox;
  await page.mouse.click(x - 10, y + 100);
  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(x + 1000, y);
  await page.mouse.up();
  await page.keyboard.up('Space');

  await expect(note).toBeHidden();

  // create edgeless text
  await page.keyboard.press('t');
  await page.mouse.click(x, y);
  await page.waitForSelector('affine-edgeless-text');
  await page.keyboard.type('Edgeless Text');

  const url = new URL(page.url());

  await clickNewPageButton(page);
  await page.keyboard.press('Enter');

  await writeTextToClipboard(page, url.toString());

  // Inline
  await page.locator('affine-reference').hover();
  await page.getByLabel('Switch view').click();
  await page.getByTestId('link-to-embed').click();

  const viewport = await page
    .locator('affine-embed-synced-doc-block')
    .boundingBox();
  expect(viewport).not.toBeNull();
  if (!viewport) return;

  const edgelessText = await page
    .locator('affine-embed-synced-doc-block affine-edgeless-text')
    .boundingBox();
  expect(edgelessText).not.toBeNull();
  if (!edgelessText) return;

  // the edgeless text should be in the viewport
  expect(viewport.x).toBeLessThanOrEqual(edgelessText.x);
  expect(viewport.y).toBeLessThanOrEqual(edgelessText.y);
  expect(viewport.x + viewport.width).toBeGreaterThanOrEqual(
    edgelessText.x + edgelessText.width
  );
  expect(viewport.y + viewport.height).toBeGreaterThanOrEqual(
    edgelessText.y + edgelessText.height
  );
});

test('should show edgeless content when switching card view of linked mode doc in edgeless', async ({
  page,
}) => {
  await page.keyboard.press('Enter');

  await clickEdgelessModeButton(page);

  const note = page.locator('affine-edgeless-note');
  const noteBoundingBox = await note.boundingBox();
  expect(noteBoundingBox).not.toBeNull();
  if (!noteBoundingBox) return;

  // move viewport
  const { x, y } = noteBoundingBox;
  await page.mouse.click(x - 100, y + 100);
  await page.keyboard.down('Space');
  await waitNextFrame(page);
  await page.mouse.down();
  await page.mouse.move(x + 1000, y, {
    steps: 20,
  });
  await page.mouse.up();
  await page.keyboard.up('Space');

  // create edgeless text
  await page.keyboard.press('t');
  await page.mouse.click(x, y + 100);
  await page.locator('affine-edgeless-text').waitFor({ state: 'visible' });
  await page.keyboard.type('Edgeless Text');

  const url = new URL(page.url());

  await clickNewPageButton(page);
  const closeAdButton = page.locator(
    '[data-testid="local-demo-tips-close-button"]'
  );
  await closeAdButton.click();
  await clickEdgelessModeButton(page);

  await page.mouse.move(x, y);
  await writeTextToClipboard(page, url.toString(), false);

  // Inline
  const embed = page.locator('affine-embed-edgeless-linked-doc-block');
  await expect(embed).toBeVisible();
  await page.getByLabel('Switch view').click();
  await page.getByTestId('link-to-embed').click();

  const viewport = await page
    .locator('affine-embed-edgeless-synced-doc-block')
    .boundingBox();
  expect(viewport).not.toBeNull();
  if (!viewport) return;

  const edgelessText = await page
    .locator('affine-embed-edgeless-synced-doc-block affine-edgeless-text')
    .boundingBox();
  expect(edgelessText).not.toBeNull();
  if (!edgelessText) return;

  // the edgeless text should be in the viewport
  expect(viewport.x).toBeLessThanOrEqual(edgelessText.x);
  expect(viewport.y).toBeLessThanOrEqual(edgelessText.y);
  expect(viewport.x + viewport.width).toBeGreaterThanOrEqual(
    edgelessText.x + edgelessText.width
  );
  expect(viewport.y + viewport.height).toBeGreaterThanOrEqual(
    edgelessText.y + edgelessText.height
  );
});

// Aliases & Copy link
test.describe('Customize linked doc title and description', () => {
  // Inline View
  test('should set a custom title for inline link', async ({ page }) => {
    await page.keyboard.press('Enter');
    await createLinkedPage(page, 'Test Page');

    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

    const link = page.locator('affine-reference');
    const title = link.locator('.affine-reference-title');

    await link.hover();
    await expect(toolbar).toBeVisible();

    // Copies link
    await toolbar.getByRole('button', { name: 'Copy link' }).click();
    await expect(toolbar).toBeHidden();

    const url0 = await link.locator('a').getAttribute('href');
    const url1 = await (
      await page.evaluateHandle(() => navigator.clipboard.readText())
    ).jsonValue();
    expect(url0).not.toBeNull();
    expect(new URL(url0!, coreUrl).pathname).toBe(new URL(url1).pathname);

    await page.waitForTimeout(200);

    // Edits title
    await link.hover();
    await toolbar.getByRole('button', { name: 'Edit' }).click();

    // Title alias
    await page.keyboard.type('Test Page Alias');
    await page.keyboard.press('Enter');

    await expect(title).toHaveText('Test Page Alias');

    await page.waitForTimeout(200);

    // Original title
    await link.hover();
    const docTitle = toolbar.getByRole('button', { name: 'Doc title' });
    await expect(docTitle).toHaveText('Test Page', { useInnerText: true });

    // Edits title
    await toolbar.getByRole('button', { name: 'Edit' }).click();

    const aliasPopup = page.locator('reference-popup');

    // Input
    await expect(aliasPopup.locator('input')).toHaveValue('Test Page Alias');

    // Reset
    await aliasPopup.getByRole('button', { name: 'Reset' }).click();

    await expect(title).toHaveText('Test Page');

    await link.hover();
    await expect(docTitle).toBeHidden();
  });

  // Card View
  test('should set a custom title and description for card link', async ({
    page,
  }) => {
    await page.keyboard.press('Enter');
    await createLinkedPage(page, 'Test Page');

    const { toolbar, switchViewBtn, inlineViewBtn, cardViewBtn } =
      toolbarButtons(page);

    const inlineLink = page.locator('affine-reference');
    await inlineLink.hover();

    // Copies link
    await toolbar.getByRole('button', { name: 'Copy link' }).click();
    const url0 = await (
      await page.evaluateHandle(() => navigator.clipboard.readText())
    ).jsonValue();

    await page.waitForTimeout(200);

    await inlineLink.hover();

    // Edits title
    await toolbar.getByRole('button', { name: 'Edit' }).click();

    // Title alias
    await page.keyboard.type('Test Page Alias');
    await page.keyboard.press('Enter');

    await page.waitForTimeout(200);

    await inlineLink.hover();

    // Switches to card view
    await switchViewBtn.click();
    await cardViewBtn.click();

    const cardLink = page.locator('affine-embed-linked-doc-block');
    const cardTitle = cardLink.locator(
      '.affine-embed-linked-doc-content-title-text'
    );
    const cardDescription = cardLink.locator(
      '.affine-embed-linked-doc-content-note.alias'
    );

    await cardLink.click();
    await cardLink.click();

    // Copies link
    await toolbar.getByRole('button', { name: 'Copy link' }).click();
    const url1 = await (
      await page.evaluateHandle(() => navigator.clipboard.readText())
    ).jsonValue();

    expect(url0).not.toBeNull();
    expect(url1).not.toBeNull();
    expect(url0).toBe(url1);

    const docTitle = toolbar.getByRole('button', { name: 'Doc title' });
    await expect(docTitle).toHaveText('Test Page', { useInnerText: true });
    await expect(cardTitle).toHaveText('Test Page Alias');

    // Edits title & description
    await toolbar.getByRole('button', { name: 'Edit' }).click();

    const cardEditPopup = page.locator('embed-card-edit-modal');

    // Title alias
    await page.keyboard.type('Test Page Alias Again');
    await page.keyboard.press('Tab');
    // Description alias
    await page.keyboard.type('This is a new description');

    // Saves aliases
    await cardEditPopup.getByRole('button', { name: 'Save' }).click();
    await expect(cardTitle).toHaveText('Test Page Alias Again');
    await expect(cardDescription).toHaveText('This is a new description');
    await expect(cardEditPopup).not.toBeVisible();

    await cardLink.click();
    await cardLink.click();

    // Switches to inline view
    {
      await switchViewBtn.click();
      await inlineViewBtn.click();

      // Focuses inline editor
      const bounds = (await inlineLink.boundingBox())!;
      await page.mouse.click(
        bounds.x + bounds.width + 30,
        bounds.y + bounds.height / 2
      );

      await inlineLink.hover();

      const title = inlineLink.locator('.affine-reference-title');
      await expect(title).toHaveText('Test Page Alias Again');

      // Switches to card view
      await switchViewBtn.click();
      await cardViewBtn.click();
    }

    await cardLink.click();
    await cardLink.click();

    await toolbar.getByRole('button', { name: 'Edit' }).click();

    // Resets
    await cardEditPopup.getByRole('button', { name: 'Reset' }).click();

    await expect(cardTitle).toHaveText('Test Page');
    await expect(cardDescription).toBeHidden();
  });

  // test('should show emoji doc icon in normal document', async ({ page }) => {
  //   await enableEmojiDocIcon(page);

  //   await clickNewPageButton(page);
  //   const title = getBlockSuiteEditorTitle(page);
  //   await title.click();

  //   await page.keyboard.press('Enter');
  //   await createLinkedPage(page, 'Test Page');

  //   const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

  //   const inlineLink = page.locator('affine-reference');
  //   await inlineLink.hover();

  //   // Edits title
  //   await toolbar.getByRole('button', { name: 'Edit' }).click();

  //   // Title alias
  //   await page.keyboard.type('🦀hello');
  //   await page.keyboard.press('Enter');

  //   const a = inlineLink.locator('a');

  //   await expect(a).toHaveText('🦀hello');
  //   await expect(a.locator('svg')).toBeHidden();
  //   await expect(a.locator('.affine-reference-title')).toHaveText('hello');
  // });

  //   test('should show emoji doc icon in journal document', async ({ page }) => {
  //     await enableEmojiDocIcon(page);

  //     await clickNewPageButton(page);
  //     const title = getBlockSuiteEditorTitle(page);
  //     await title.click();

  //     await page.keyboard.press('Enter');
  //     await createTodayPage(page);

  //     const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

  //     const inlineLink = page.locator('affine-reference');
  //     await inlineLink.hover();

  //     // Edits title
  //     await toolbar.getByRole('button', { name: 'Edit' }).click();

  //     // Title alias
  //     await page.keyboard.type('🦀');
  //     await page.keyboard.press('Enter');

  //     const a = inlineLink.locator('a');

  //     const year = String(new Date().getFullYear());
  //     await expect(a).toContainText('🦀');
  //     await expect(a.locator('svg')).toBeHidden();
  //     await expect(a.locator('.affine-reference-title')).toContainText(year);
  //   });
});

test('should save open doc mode of internal links', async ({ page }) => {
  await enableEmojiDocIcon(page);

  await clickNewPageButton(page);
  const title = getBlockSuiteEditorTitle(page);
  await title.click();

  await page.keyboard.press('Enter');
  await createLinkedPage(page, 'Test Page');

  const { toolbar, switchViewBtn, inlineViewBtn, cardViewBtn, embedViewBtn } =
    toolbarButtons(page);

  const inlineLink = page.locator('affine-reference');
  await inlineLink.hover();

  const recentOpenModeBtn = toolbar.locator(
    'editor-icon-button:has-text("Open")'
  );
  await expect(recentOpenModeBtn).toHaveAttribute(
    'aria-label',
    'Open this doc'
  );
  await expect(
    recentOpenModeBtn.locator('span.label:has-text("Open")')
  ).toBeVisible();

  const openDocBtn = toolbar.getByLabel(/^Open doc with$/);
  await openDocBtn.click();

  const openDocMenu = toolbar.getByLabel('Open doc menu');

  const openThisDocBtn = openDocMenu.getByLabel('Open this doc');
  // In Desktop
  const openInSplitViewBtn = openDocMenu.getByLabel('Open in split view');
  const openInNewTabBtn = openDocMenu.getByLabel('Open in new tab');
  const openInCenterPeekBtn = openDocMenu.getByLabel('Open in center peek');

  await expect(openThisDocBtn).toBeVisible();
  await expect(openInSplitViewBtn).toBeHidden();
  await expect(openInNewTabBtn).toBeVisible();
  await expect(openInCenterPeekBtn).toBeVisible();

  await openInCenterPeekBtn.click();

  await page.keyboard.press('Escape');

  await inlineLink.hover();

  await expect(toolbar).toBeVisible();
  await expect(recentOpenModeBtn).toHaveAttribute(
    'aria-label',
    'Open in center peek'
  );

  await switchViewBtn.click();
  await cardViewBtn.click();

  await expect(toolbar).toBeVisible();
  await expect(recentOpenModeBtn).toHaveAttribute(
    'aria-label',
    'Open in center peek'
  );

  await switchViewBtn.click();
  await embedViewBtn.click();

  await expect(toolbar).toBeVisible();
  await expect(recentOpenModeBtn).toHaveAttribute(
    'aria-label',
    'Open in center peek'
  );

  await switchViewBtn.click();
  await inlineViewBtn.click();

  await inlineLink.hover();

  await page.waitForTimeout(250);

  await expect(toolbar).toBeVisible();
  await expect(recentOpenModeBtn).toHaveAttribute(
    'aria-label',
    'Open in center peek'
  );
});

test('should show full email address', async ({ page }) => {
  await page.keyboard.press('Enter');

  await writeTextToClipboard(page, 'dev@affine.pro');

  const inlineLink = page.locator('affine-link');

  await expect(inlineLink).toHaveText('dev@affine.pro');

  await inlineLink.hover();

  const { toolbar, switchViewBtn } = toolbarButtons(page);

  await expect(toolbar).toBeVisible();
  await expect(switchViewBtn).toBeHidden();

  await expect(toolbar.locator('affine-link-preview')).toHaveText(
    'dev@affine.pro'
  );
});

test('should not show view toggle button when protocol of link is not http(s)', async ({
  page,
}) => {
  await page.keyboard.press('Enter');

  await writeTextToClipboard(page, 'ftp://affine.pro/blocksuite.pdf');

  const inlineLink = page.locator('affine-link');

  await expect(inlineLink).toHaveText('ftp://affine.pro/blocksuite.pdf');

  await inlineLink.hover();

  const { toolbar, switchViewBtn } = toolbarButtons(page);

  await expect(toolbar).toBeVisible();
  await expect(switchViewBtn).toBeHidden();

  await expect(toolbar.locator('affine-link-preview')).toHaveText('affine.pro');
});

test('should reach target block when clicking affine-link multiple times', async ({
  page,
}) => {
  await page.keyboard.press('Enter');
  await page.keyboard.type('a');

  await page.keyboard.press('Enter');
  await page.keyboard.type('b');

  await page.keyboard.press('Enter');
  await page.keyboard.type('c');

  await selectAllByKeyboard(page);

  const { toolbar } = toolbarButtons(page);

  await toolbar.getByLabel('More menu').click();
  await toolbar.getByLabel('Copy link to block').click();

  const paragraph = page.locator('affine-paragraph').nth(0);
  await paragraph.click();

  await selectAllByKeyboard(page);

  await toolbar.getByLabel(/^Link$/).click();

  await page.waitForSelector('.affine-link-popover');

  await pasteByKeyboard(page);

  await page.locator('.affine-confirm-button').click();

  const scrollAnchoringWidget = page.locator('affine-scroll-anchoring-widget');
  const highlight = scrollAnchoringWidget.locator('.highlight');

  const inlineLink = page.locator('affine-link');

  await inlineLink.click();
  await expect(highlight).toBeVisible();
  const url0 = new URL(page.url());
  const refreshKey0 = url0.searchParams.get('refreshKey');
  expect(refreshKey0).not.toBeNull();

  await paragraph.click();
  await expect(highlight).toBeHidden();

  await inlineLink.click();
  await expect(highlight).toBeVisible();
  const url1 = new URL(page.url());
  const refreshKey1 = url1.searchParams.get('refreshKey');
  expect(refreshKey1).not.toBeNull();

  await paragraph.click();
  await expect(highlight).toBeHidden();

  expect(refreshKey0).not.toEqual(refreshKey1);
});

test('should display date as the original title of journal', async ({
  page,
}) => {
  await page.keyboard.press('Enter');
  await createTodayPage(page);

  const { toolbar, switchViewBtn, cardViewBtn } = toolbarButtons(page);

  const linkedDocTitle = toolbar.locator('affine-linked-doc-title .label');

  const inlineLink = page.locator('affine-reference');
  await inlineLink.hover();

  await expect(toolbar).toBeVisible();
  await expect(linkedDocTitle).toBeHidden();

  // Edits title & description
  await toolbar.getByRole('button', { name: 'Edit' }).click();

  await expect(toolbar).toBeHidden();

  const popover = page.locator('reference-popup');

  // Title alias
  await page.keyboard.type('Test Page Alias Again');
  await page.keyboard.press('Tab');
  // Description alias
  await page.keyboard.type('This is a new description');

  await popover.getByLabel('Save').click();

  await inlineLink.hover();
  await expect(toolbar).toBeVisible();
  await expect(linkedDocTitle).toBeVisible();
  const inlineTitleText = (await linkedDocTitle.textContent())?.trim() ?? '';

  const year = String(new Date().getFullYear());
  expect(inlineTitleText).toContain(year);

  await switchViewBtn.click();
  await cardViewBtn.click();

  const cardLink = page.locator('affine-embed-linked-doc-block');
  await expect(cardLink).toBeVisible();

  await expect(toolbar).toBeVisible();
  await expect(linkedDocTitle).toBeVisible();
  const cardViewTitleText = (await linkedDocTitle.textContent())?.trim() ?? '';

  expect(cardViewTitleText).toBe(inlineTitleText);

  // Edits title & description
  await toolbar.getByRole('button', { name: 'Edit' }).click();

  await expect(toolbar).toBeHidden();

  const cardEditPopup = page.locator('embed-card-edit-modal');
  // Resets
  await cardEditPopup.getByRole('button', { name: 'Reset' }).click();

  await expect(toolbar).toBeVisible();
  await expect(linkedDocTitle).toBeHidden();
});

test('should add HTTP protocol into link automatically', async ({ page }) => {
  await page.keyboard.press('Enter');

  await page.keyboard.type('github.com');
  await page.keyboard.type('/');
  await page.keyboard.type('toeverything');
  await page.keyboard.type('/');
  await page.keyboard.type('affine');

  await page.keyboard.press('Space');

  const link = 'https://github.com/toeverything/affine';

  const { toolbar, switchViewBtn, cardViewBtn } = toolbarButtons(page);

  const inlineLink = page.locator('affine-link');

  await expect(inlineLink).toBeVisible();

  let url = await inlineLink.locator('a').getAttribute('href');
  expect(url).toBe(link);

  await inlineLink.hover();

  const linkPreview = toolbar.locator('affine-link-preview');

  url = await linkPreview.locator('a').getAttribute('href');
  expect(url).toBe(link);

  await switchViewBtn.click();
  await cardViewBtn.click();

  const cardLink = page.locator('affine-bookmark');

  await expect(cardLink).toBeVisible();

  url = await linkPreview.locator('a').getAttribute('href');
  expect(url).toBe(link);
});

test('should open link in new tab when middle clicking on link', async ({
  page,
  context,
}) => {
  await pressEnter(page);

  // external link
  {
    await type(page, 'external-link');
    await selectAllByKeyboard(page);
    const toolbar = locateToolbar(page);
    await toolbar.getByTestId('link').click();
    const input = page.locator('.affine-link-popover-input');

    const externalUrl = new URL('https://github.com/').toString();
    await input.fill(externalUrl);
    await pressEnter(page);

    const newTabPromise = context.waitForEvent('page');

    await page.locator('affine-link').click({ button: 'middle' });

    const newTab = await newTabPromise;
    await expect(newTab).toHaveURL(externalUrl);
    await newTab.close();
  }

  await selectAllByKeyboard(page);
  await pressBackspace(page);

  // internal link
  {
    await type(page, 'internal-link');
    const url = page.url();
    await selectAllByKeyboard(page);
    const toolbar = locateToolbar(page);
    await toolbar.getByTestId('link').click();
    const input = page.locator('.affine-link-popover-input');
    await input.fill(url);
    await pressEnter(page);

    const newTabPromise = context.waitForEvent('page');

    await page.locator('affine-link').click({ button: 'middle' });

    const newTab = await newTabPromise;
    // there is a refreshKey in the url
    expect(newTab.url()).toContain(url);
    await newTab.close();
  }

  await selectAllByKeyboard(page);
  await pressBackspace(page);

  // reference doc
  {
    await pressArrowUp(page);
    await type(page, 'ThisPage');
    await pressEnter(page);
    await type(page, '@ThisPage');
    await pressEnter(page);

    const newTabPromise = context.waitForEvent('page');

    await page.locator('affine-reference').click({ button: 'middle' });

    const newTab = await newTabPromise;
    expect(newTab.url()).toContain(page.url());
    await newTab.close();
  }
});
