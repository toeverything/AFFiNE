import { test } from '@affine-test/kit/playwright';
import {
  confirmCreateJournal,
  openHomePage,
} from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect, type Locator, type Page } from '@playwright/test';

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
    const newState = await checkbox.inputValue();
    const newChecked = newState === 'on';
    expect(newChecked).toBe(value);
  }
}

const createDocAndMarkAsTemplate = async (
  page: Page,
  title?: string,
  onCreated?: () => Promise<void>
) => {
  await page.getByTestId('sidebar-new-page-button').click();
  await waitForEditorLoad(page);

  if (title) {
    await page.keyboard.type(title);
  }

  const collapse = page.getByTestId('page-info-collapse');
  const open = await collapse.getAttribute('aria-expanded');
  if (open?.toLowerCase() !== 'true') {
    await collapse.click();
  }

  // add if not exists
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
  }
  // expand if collapsed
  else if (!(await getTemplateRow(page).isVisible())) {
    await page.getByTestId('property-collapsible-button').click();
  }

  const templateRow = getTemplateRow(page);
  await expect(templateRow).toBeVisible();
  await toggleTemplate(templateRow, true);

  // focus editor
  await page.locator('affine-note').first().click();
  await onCreated?.();
};

const getDocId = async (page: Page) => {
  const docId = await page.evaluate(() => {
    const url = window.location.href;
    const id = url.split('/').pop()?.split('?')[0];
    return id;
  });
  return docId;
};

const enableAskMeEveryTime = async (page: Page) => {
  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await page.getByTestId('editor-panel-trigger').click();
  await page.getByTestId('new-doc-default-mode-trigger').click();
  await page.getByTestId('ask-every-time-trigger').click();
  await page.keyboard.press('Escape');
};

test('create a doc and mark it as template', async ({ page }) => {
  await openHomePage(page);
  await createDocAndMarkAsTemplate(page, 'Test Template', async () => {
    await page.keyboard.type('# Template');
    await page.keyboard.press('Enter');
    await page.keyboard.type('This is a template doc');
  });
});

test('create a doc, and initialize it from template', async ({ page }) => {
  await openHomePage(page);
  await createDocAndMarkAsTemplate(page, 'Test Template', async () => {
    await page.keyboard.type('# Template');
    await page.keyboard.press('Enter');
    await page.keyboard.type('This is a template doc');
  });

  await page.getByTestId('sidebar-new-page-button').click();
  await waitForEditorLoad(page);
  await page.getByTestId('template-docs-badge').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.getByText('This is a template doc')).toBeVisible();

  // the starter bar should be hidden
  await expect(page.getByTestId('template-docs-badge')).not.toBeVisible();
});

test('enable ask me every time for new doc', async ({ page }) => {
  const withAskButton = page.getByTestId('sidebar-new-page-with-ask-button');
  const withoutAskButton = page.getByTestId('sidebar-new-page-button');

  await openHomePage(page);
  await expect(withAskButton).not.toBeVisible();
  await expect(withoutAskButton).toBeVisible();

  await enableAskMeEveryTime(page);
  await expect(withAskButton).toBeVisible();
  await expect(withoutAskButton).not.toBeVisible();
});

test('set default template for page', async ({ page }) => {
  await openHomePage(page);
  await createDocAndMarkAsTemplate(page, 'Test Template', async () => {
    await page.keyboard.type('# Template');
    await page.keyboard.press('Enter');
    await page.keyboard.type('This is a template doc');
  });
  const templateDocId = await getDocId(page);

  // create a new page, should not inherit template
  await page.getByTestId('sidebar-new-page-button').click();
  await waitForEditorLoad(page);
  await expect(page.getByText('This is a template doc')).not.toBeVisible();

  // enable page template and set a template
  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await page.getByTestId('workspace-setting:preference').click();
  const pageTemplateSwitch = page.getByTestId('page-template-switch');
  await pageTemplateSwitch.click();
  const pageTemplateSelector = page.getByTestId('page-template-selector');
  await expect(pageTemplateSelector).toBeVisible();
  await pageTemplateSelector.click();
  await page.getByTestId(`template-doc-item-${templateDocId}`).click();

  // close setting, create a new page from sidebar
  await page.getByTestId('modal-close-button').click();
  await page.getByTestId('sidebar-new-page-button').click();
  await waitForEditorLoad(page);
  await expect(page.getByText('This is a template doc')).toBeVisible();

  // remove template
  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await page.getByTestId('workspace-setting:preference').click();
  await page.getByTestId('page-template-selector').click();
  await page.getByTestId('template-doc-item-remove').click();

  // close setting, create a new page from sidebar
  await page.getByTestId('modal-close-button').click();
  await page.getByTestId('sidebar-new-page-button').click();
  await waitForEditorLoad(page);
  await expect(page.getByText('This is a template doc')).not.toBeVisible();
});

test('set default template for journal', async ({ page }) => {
  await openHomePage(page);
  await createDocAndMarkAsTemplate(page, 'Page Template', async () => {
    await page.keyboard.type('# Page Template');
    await page.keyboard.press('Enter');
    await page.keyboard.type('This is a page template doc');
  });
  const pageTemplateDocId = await getDocId(page);
  await createDocAndMarkAsTemplate(page, 'Journal Template', async () => {
    await page.keyboard.type('# Journal Template');
    await page.keyboard.press('Enter');
    await page.keyboard.type('This is a journal template doc');
  });
  const journalTemplateDocId = await getDocId(page);

  // by default create a journal, should not use template
  await page.getByTestId('slider-bar-journals-button').click();
  await confirmCreateJournal(page);
  await waitForEditorLoad(page);
  await expect(
    page.getByText('This is a journal template doc')
  ).not.toBeVisible();
  await expect(page.getByText('This is a page template doc')).not.toBeVisible();

  // enable page template, new journal should use page template
  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await page.getByTestId('workspace-setting:preference').click();
  await page.getByTestId('page-template-switch').click();
  await page.getByTestId('page-template-selector').click();
  await page.getByTestId(`template-doc-item-${pageTemplateDocId}`).click();
  await page.getByTestId('modal-close-button').click();
  // create a new journal
  const prevWeekButton = page.getByTestId('week-picker-prev');
  await prevWeekButton.click();
  await page.getByTestId('week-picker-day').first().click();
  await confirmCreateJournal(page);
  await waitForEditorLoad(page);
  await expect(page.getByText('This is a page template doc')).toBeVisible();

  // set journal template, new journal should use journal template
  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await page.getByTestId('workspace-setting:preference').click();
  await page.getByTestId('journal-template-selector').click();
  await page.getByTestId(`template-doc-item-${journalTemplateDocId}`).click();
  await page.getByTestId('modal-close-button').click();
  // create a new journal
  await prevWeekButton.click();
  await page.getByTestId('week-picker-day').first().click();
  await confirmCreateJournal(page);
  await waitForEditorLoad(page);
  await expect(page.getByText('This is a journal template doc')).toBeVisible();
});

test('open template doc from sidebar template entrance', async ({ page }) => {
  await openHomePage(page);
  await createDocAndMarkAsTemplate(page, 'Test Template', async () => {
    await page.keyboard.type('# Template');
    await page.keyboard.press('Enter');
    await page.keyboard.type('This is a template doc');
  });
  const templateDocId = await getDocId(page);

  await page.getByTestId('sidebar-new-page-button').click();
  await waitForEditorLoad(page);
  await expect(page.getByText('This is a template doc')).not.toBeVisible();

  await page.getByTestId('sidebar-template-doc-entrance').click();
  await page.getByTestId(`template-doc-item-${templateDocId}`).click();
  await waitForEditorLoad(page);
  await expect(page.getByText('This is a template doc')).toBeVisible();
});

test('create template doc from sidebar template entrance', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await page.getByTestId('sidebar-template-doc-entrance').click();
  await page.getByTestId('template-doc-item-create').click();

  await page.locator('affine-note').first().click();
  await page.keyboard.press('Backspace');
  await page.keyboard.type('Template');
  const templateDocId = await getDocId(page);

  await page.getByTestId('sidebar-template-doc-entrance').click();
  await expect(
    page.getByTestId(`template-doc-item-${templateDocId}`)
  ).toBeVisible();
});

test('should show starter-bar when doc is empty', async ({ page }) => {
  await openHomePage(page);
  await page.getByTestId('sidebar-new-page-button').click();
  await page.keyboard.press('ArrowDown');
  const starterBar = page.getByTestId('starter-bar');
  await expect(starterBar).toBeVisible();

  await page.keyboard.type('1', { delay: 100 });
  await expect(starterBar).not.toBeVisible();
  await page.keyboard.type('1', { delay: 100 });
  await expect(starterBar).not.toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(starterBar).not.toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(starterBar).toBeVisible();
  await page.keyboard.type('1', { delay: 100 });
  await expect(starterBar).not.toBeVisible();
});
