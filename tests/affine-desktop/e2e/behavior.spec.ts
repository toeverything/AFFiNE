import os from 'node:os';

import { test } from '@affine-test/kit/electron';
import { shouldCallIpcRendererHandler } from '@affine-test/kit/utils/ipc';

test.describe('behavior test', () => {
  if (os.platform() === 'darwin') {
    test('system button should hidden correctly', async ({
      page,
      electronApp,
    }) => {
      {
        const promise = shouldCallIpcRendererHandler(
          electronApp,
          'ui:handleSidebarVisibilityChange'
        );
        await page
          .locator(
            '[data-testid=app-sidebar-arrow-button-collapse][data-show=true]'
          )
          .click();
        await promise;
      }
      {
        const promise = shouldCallIpcRendererHandler(
          electronApp,
          'ui:handleSidebarVisibilityChange'
        );
        await page
          .locator(
            '[data-testid=app-sidebar-arrow-button-expand][data-show=true]'
          )
          .click();
        await promise;
      }
    });
  }
});
