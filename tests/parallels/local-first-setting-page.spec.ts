import { resolve } from 'node:path';

import { test, testResultDir } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitEditorLoad } from '../libs/page-logic';
import { clickSideBarSettingButton } from '../libs/sidebar';

test('Should highlight the setting page menu when selected', async ({
  page,
}) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const element = await page.getByTestId('slider-bar-workspace-setting-button');
  const prev = await element.screenshot({
    path: resolve(
      testResultDir,
      'slider-bar-workspace-setting-button-prev.png'
    ),
  });
  await clickSideBarSettingButton(page);
  await page.waitForTimeout(50);
  const after = await element.screenshot({
    path: resolve(
      testResultDir,
      'slider-bar-workspace-setting-button-after.png'
    ),
  });
  expect(prev).not.toEqual(after);
});
