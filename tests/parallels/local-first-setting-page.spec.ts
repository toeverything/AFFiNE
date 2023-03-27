import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { test } from '../libs/playwright';
import { clickSideBarSettingButton } from '../libs/sidebar';

test.describe('Local first setting page', () => {
  test('Should highlight the setting page menu when selected', async ({
    page,
  }) => {
    await openHomePage(page);
    const element = await page.getByTestId(
      'slider-bar-workspace-setting-button'
    );
    const prevColor = await element.evaluate(
      element => window.getComputedStyle(element).color
    );
    await clickSideBarSettingButton(page);
    const currentColor = await element.evaluate(
      element => window.getComputedStyle(element).color
    );
    expect(prevColor).not.toBe(currentColor);
  });
});
