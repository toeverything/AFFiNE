import {
  clickEdgelessModeButton,
  locateEditorContainer,
  locateToolbar,
} from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  type,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Page, test } from '@playwright/test';

const TEST_SPOTIFY_URL =
  'https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5';

const TEST_AFFINE_URL = 'https://app.affine.pro/';

const EMBED_IFRAME_BLOCK = 'affine-embed-iframe-block';
const EMBED_EDGELESS_IFRAME_BLOCK = 'affine-embed-edgeless-iframe-block';
const IDLE_CARD = 'embed-iframe-idle-card';
const LINK_INPUT_POPUP = 'embed-iframe-link-input-popup';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);
  await page.locator('affine-paragraph v-line div').click();
});

test.describe('embed iframe block', () => {
  async function addEmbedIframeBlock(page: Page) {
    await type(page, '/embed');
    const embedItem = page.getByTestId('Embed');
    await embedItem.click();

    const embedIframeBlock = page.locator(EMBED_IFRAME_BLOCK);
    await expect(embedIframeBlock).toBeVisible();

    const embedIframeIdleCard = page.locator(IDLE_CARD);
    await expect(embedIframeIdleCard).toBeVisible();

    const embedIframeLinkInputPopup = page.locator(LINK_INPUT_POPUP);
    await expect(embedIframeLinkInputPopup).toBeVisible();

    const input = embedIframeLinkInputPopup.locator('input');
    await expect(input).toBeFocused();

    return {
      embedIframeBlock,
      embedIframeIdleCard,
      embedIframeLinkInputPopup,
      input,
    };
  }

  async function openToolbarAndSwitchView(page: Page) {
    // expect toolbar to be visible
    const toolbar = locateToolbar(page);
    await expect(toolbar).toBeVisible();

    // switch to inline view
    await page.getByRole('button', { name: 'Switch view' }).click();
  }

  test('add embed iframe block using slash menu', async ({ page }) => {
    const {
      embedIframeBlock,
      embedIframeIdleCard,
      embedIframeLinkInputPopup,
      input,
    } = await addEmbedIframeBlock(page);

    await input.fill(TEST_SPOTIFY_URL);
    await input.press('Enter');
    await page.waitForTimeout(100);

    await expect(embedIframeLinkInputPopup).not.toBeVisible();
    await expect(embedIframeIdleCard).not.toBeVisible();

    // expect the embed iframe block count is 1
    await expect(embedIframeBlock).toHaveCount(1);
  });

  test('add bookmark when the url cannot be embedded', async ({ page }) => {
    const {
      embedIframeBlock,
      embedIframeIdleCard,
      embedIframeLinkInputPopup,
      input,
    } = await addEmbedIframeBlock(page);

    await input.fill(TEST_AFFINE_URL);
    await input.press('Enter');

    await expect(embedIframeLinkInputPopup).not.toBeVisible();
    await expect(embedIframeIdleCard).not.toBeVisible();

    // expect the embed iframe block count is 0
    await expect(embedIframeBlock).toHaveCount(0);

    // expect the bookmark block count is 1
    const bookmarkBlock = page.locator('affine-bookmark');
    await expect(bookmarkBlock).toHaveCount(1);
  });

  test('add embed iframe url by clicking the idle card', async ({ page }) => {
    const {
      embedIframeBlock,
      embedIframeIdleCard,
      embedIframeLinkInputPopup,
      input,
    } = await addEmbedIframeBlock(page);
    // click somewhere else to close the link input popup
    // click position below the popup
    const popupBoundingBox = await embedIframeLinkInputPopup.boundingBox();
    expect(popupBoundingBox).not.toBeNull();
    if (!popupBoundingBox) return;
    await page.mouse.click(popupBoundingBox.x - 50, popupBoundingBox.y + 100);
    await page.waitForTimeout(100);

    await expect(embedIframeLinkInputPopup).not.toBeVisible();

    // click the idle card
    await embedIframeIdleCard.click();
    await expect(embedIframeLinkInputPopup).toBeVisible();

    // fill the url
    await input.fill(TEST_SPOTIFY_URL);
    await input.press('Enter');

    await expect(embedIframeLinkInputPopup).not.toBeVisible();
    await expect(embedIframeIdleCard).not.toBeVisible();
    await expect(embedIframeBlock).toHaveCount(1);
  });

  test.describe('conversions', () => {
    async function setupEmbedIframe(page: Page) {
      const { embedIframeBlock, input } = await addEmbedIframeBlock(page);

      // fill the url
      await input.fill(TEST_SPOTIFY_URL);
      await input.press('Enter');

      // wait until iframe is loaded
      await expect(embedIframeBlock).toBeVisible();

      // click to select embed iframe block
      await embedIframeBlock.click();

      return { embedIframeBlock };
    }

    test('embed iframe block to link text', async ({ page }) => {
      const { embedIframeBlock } = await setupEmbedIframe(page);

      await openToolbarAndSwitchView(page);
      await page.getByRole('button', { name: 'Inline view' }).click();

      const affineLink = page.locator('affine-link');
      await expect(affineLink).toBeVisible();

      // hover affine link
      await affineLink.hover();
      await page.waitForTimeout(100);

      // convert back to embed iframe block
      await openToolbarAndSwitchView(page);
      await page.getByRole('button', { name: 'Embed view' }).click();

      // expect the embed iframe block count is 1
      await expect(embedIframeBlock).toHaveCount(1);

      // expect the link text content is the url
      await expect(affineLink).toHaveCount(0);
    });

    test('embed iframe block to bookmark card', async ({ page }) => {
      const { embedIframeBlock } = await setupEmbedIframe(page);

      await openToolbarAndSwitchView(page);
      await page.getByRole('button', { name: 'Card view' }).click();

      // expect the embed iframe block count is 0
      await expect(embedIframeBlock).toHaveCount(0);

      // expect the bookmark block count is 1
      const bookmarkBlock = page.locator('affine-bookmark');
      await expect(bookmarkBlock).toHaveCount(1);

      // click the bookmark block
      await bookmarkBlock.click();

      // convert back to embed iframe block
      await openToolbarAndSwitchView(page);
      await page.getByRole('button', { name: 'Embed view' }).click();

      // expect the embed iframe block count is 1
      await expect(embedIframeBlock).toHaveCount(1);
      await expect(bookmarkBlock).toHaveCount(0);
    });
  });

  test.describe('edgeless mode', () => {
    // add embed iframe block to edgeless mode by cmdk menu
    async function addEmbedEdgelessIframeBlock(page: Page) {
      // switch to edgeless mode
      await clickEdgelessModeButton(page);
      const container = locateEditorContainer(page);
      await container.click();

      // press @ to trigger the menu
      await page.keyboard.press('@');

      // type spotify url
      await page.keyboard.type(TEST_SPOTIFY_URL);

      // click item which data-testid='cmdk-label'
      await page
        .locator(
          `[data-testid="cmdk-label"][data-value="external-link:${TEST_SPOTIFY_URL}"]`
        )
        .click();

      // expect the embed iframe block count is 1
      const embedEdgelessIframeBlock = page.locator(
        EMBED_EDGELESS_IFRAME_BLOCK
      );
      await expect(embedEdgelessIframeBlock).toHaveCount(1);
    }

    test('insert embed iframe block to edgeless directly', async ({ page }) => {
      await addEmbedEdgelessIframeBlock(page);
    });

    test('convert between embed view and card view', async ({ page }) => {
      await addEmbedEdgelessIframeBlock(page);

      await openToolbarAndSwitchView(page);
      await page.getByRole('button', { name: 'Card view' }).click();

      // expect the embed iframe block count is 0
      const embedEdgelessIframeBlock = page.locator(
        EMBED_EDGELESS_IFRAME_BLOCK
      );
      await expect(embedEdgelessIframeBlock).toHaveCount(0);

      // expect the bookmark block count is 1
      const bookmarkEdgelessBlock = page.locator('affine-edgeless-bookmark');
      await expect(bookmarkEdgelessBlock).toHaveCount(1);

      // click the bookmark block
      await bookmarkEdgelessBlock.click();

      // convert back to embed view
      await openToolbarAndSwitchView(page);
      await page.getByRole('button', { name: 'Embed view' }).click();

      // expect the embed iframe block count is 1
      await expect(embedEdgelessIframeBlock).toHaveCount(1);
    });
  });
});
