import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const getPropertyValueLocator = (page: Page, property: string) => {
  return page.locator(
    `[data-testid="doc-property-name"]:has-text("${property}") + *`
  );
};

export const ensurePagePropertiesVisible = async (page: Page) => {
  if (
    await page
      .getByRole('button', {
        name: 'Add property',
      })
      .isVisible()
  ) {
    return;
  }
  await page.getByTestId('page-info-collapse').click();
};

export const clickPropertyValue = async (page: Page, property: string) => {
  await getPropertyValueLocator(page, property).click();
};

export const openTagsEditor = async (page: Page) => {
  await clickPropertyValue(page, 'tags');
  await expect(page.getByTestId('tags-editor-popup')).toBeVisible();
};

export const closeTagsEditor = async (page: Page) => {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('tags-editor-popup')).not.toBeVisible();
};

export const clickTagFromSelector = async (page: Page, name: string) => {
  // assume that the tags editor is already open
  await page
    .locator(`[data-testid="tag-selector-item"][data-tag-value="${name}"]`)
    .click();
};

export const removeSelectedTag = async (page: Page, name: string) => {
  await page
    .locator(
      `[data-testid="tags-editor-popup"] [data-testid="inline-tags-list"] [data-tag-value="${name}"] [data-testid="remove-tag-button"]`
    )
    .click();
};

export const filterTags = async (page: Page, filter: string) => {
  await page
    .locator(
      '[data-testid="tags-editor-popup"] [data-testid="inline-tags-list"] input'
    )
    .fill(filter);
};

export const searchAndCreateTag = async (page: Page, name: string) => {
  await filterTags(page, name);
  await page
    .locator(
      '[data-testid="tags-editor-popup"] [data-testid="tag-selector-item"]:has-text("Create ")'
    )
    .click();
};

export const expectTagsVisible = async (
  root: Locator | Page,
  tags: string[]
) => {
  const tagListPanel = root
    .getByTestId('property-tags-value')
    .getByTestId('inline-tags-list');

  expect(await tagListPanel.locator('[data-tag-value]').count()).toBe(
    tags.length
  );

  for (const tag of tags) {
    await expect(
      tagListPanel.locator(`[data-tag-value="${tag}"]`)
    ).toBeVisible();
  }
};

export const clickAddPropertyButton = async (root: Locator | Page) => {
  await root
    .getByRole('button', {
      name: 'Add property',
    })
    .click();
};

export const ensureAddPropertyButtonVisible = async (
  page: Page,
  root: Locator | Page
) => {
  if (
    await root
      .getByRole('button', {
        name: 'Add property',
      })
      .isVisible()
  ) {
    return;
  }
  await togglePropertyListVisibility(page);
  await page.waitForTimeout(500);
  await expect(
    root.getByRole('button', { name: 'Add property' })
  ).toBeVisible();
};

export const togglePropertyListVisibility = async (page: Page) => {
  await page.getByTestId('property-collapsible-button').click();
};

export const addCustomProperty = async (
  page: Page,
  root: Locator | Page,
  type: string
) => {
  await ensureAddPropertyButtonVisible(page, root);
  await clickAddPropertyButton(root);
  await page
    .locator(
      `[data-testid="${'create-property-menu-item'}"][data-property-type="${type}"]`
    )
    .click();
  if (await page.getByTestId('edit-property-menu-item').isVisible()) {
    // is edit property menu opened, close it
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(500);
};

export const expectPropertyOrdering = async (
  page: Page,
  properties: string[]
) => {
  for (let i = 0; i < properties.length; i++) {
    await expect(
      page.locator(`[data-testid="page-property-row-name"])`).nth(i)
    ).toHaveText(properties[i]);
  }
};

export const openWorkspaceProperties = async (page: Page) => {
  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await page.getByTestId('workspace-setting:properties').click();
};

export const selectVisibilitySelector = async (
  page: Page,
  name: string,
  option: string
) => {
  await page
    .getByRole('menu')
    .locator(
      `[data-testid="page-properties-settings-menu-item"]:has-text("${name}")`
    )
    .getByRole('button')
    .click();

  await page
    .getByRole('menu')
    .last()
    .getByRole('menuitem', {
      name: option,
      exact: true,
    })
    .click();

  await page.waitForTimeout(500);

  await page.keyboard.press('Escape');

  await page.waitForTimeout(500);
};

export const changePropertyVisibility = async (
  page: Page,
  name: string,
  option: string
) => {
  await page
    .locator(`[data-testid="doc-property-name"]:has-text("${name}")`)
    .click();
  await page.locator(`[data-property-visibility="${option}"]`).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
};
