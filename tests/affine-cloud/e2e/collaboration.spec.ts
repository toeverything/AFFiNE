import { Path, skipOnboarding, test } from '@affine-test/kit/playwright';
import {
  addUserToWorkspace,
  createRandomUser,
  enableCloudWorkspace,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickUserInfoCard } from '@affine-test/kit/utils/setting';
import { clickSideBarSettingButton } from '@affine-test/kit/utils/sidebar';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

let user: {
  id: string;
  name: string;
  email: string;
  password: string;
};

test.beforeEach(async ({ page }) => {
  user = await createRandomUser();
  await loginUser(page, user);
});

// SKIP until BS-671 fix
test.skip('can collaborate with other user and name should display when editing', async ({
  page,
  browser,
}) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await enableCloudWorkspace(page);
  await clickNewPageButton(page);
  const currentUrl = page.url();
  // format: http://localhost:8080/workspace/${workspaceId}/xxx
  const workspaceId = currentUrl.split('/')[4];
  const userB = await createRandomUser();
  const context = await browser.newContext();
  await skipOnboarding(context);
  const page2 = await context.newPage();
  await loginUser(page2, userB);
  await addUserToWorkspace(workspaceId, userB.id, 1 /* READ */);
  await page2.reload();
  await waitForEditorLoad(page2);
  await page2.goto(currentUrl);
  {
    const title = getBlockSuiteEditorTitle(page);
    await title.pressSequentially('TEST TITLE', {
      delay: 50,
    });
  }
  await page2.waitForTimeout(200);
  {
    const title = getBlockSuiteEditorTitle(page2);
    await expect(title).toHaveText('TEST TITLE');
    const typingPromise = (async () => {
      await page.keyboard.press('Enter', { delay: 50 });
      await page.keyboard.type('TEST CONTENT', { delay: 50 });
    })();
    // username should be visible when editing
    await expect(page2.getByText(user.name)).toBeVisible();
    await typingPromise;
  }

  // change username
  await clickSideBarSettingButton(page);
  await clickUserInfoCard(page);
  const input = page.getByTestId('user-name-input');
  await input.clear();
  await input.pressSequentially('TEST USER', {
    delay: 50,
  });
  await page.getByTestId('save-user-name').click({
    delay: 50,
  });
  await page.keyboard.press('Escape', {
    delay: 50,
  });
  const title = getBlockSuiteEditorTitle(page);
  await title.focus();
  await page.keyboard.press('ArrowDown', { delay: 50 });
  {
    await expect(page2.getByText('TEST USER')).toBeVisible({
      timeout: 2000,
    });
  }
});

test('can sync collections between different browser', async ({
  page,
  browser,
}) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await enableCloudWorkspace(page);
  await page.getByTestId('navigation-panel-bar-add-collection-button').click();
  const title = page.getByTestId('prompt-modal-input');
  await title.isVisible();
  await title.fill('test collection');
  await page.getByTestId('prompt-modal-confirm').click();

  {
    const context = await browser.newContext();
    await skipOnboarding(context);
    const page2 = await context.newPage();
    await loginUser(page2, user);
    await page2.goto(page.url());
    const collections = page2.getByTestId('navigation-panel-collections');
    await collections.getByTestId('category-divider-collapse-button').click();
    await expect(collections.getByText('test collection')).toBeVisible();
  }
});

test('can sync svg between different browsers', async ({ page, browser }) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await enableCloudWorkspace(page);
  await clickNewPageButton(page);
  await waitForEditorLoad(page);

  // upload local svg

  const slashMenu = page.locator(`.slash-menu`);
  const image = page.locator('affine-image');

  await page.evaluate(async () => {
    // https://github.com/toeverything/blocksuite/blob/master/packages/blocks/src/_common/utils/filesys.ts#L20
    (window as any).showOpenFilePicker = undefined;
  });

  const title = getBlockSuiteEditorTitle(page);
  await title.pressSequentially('TEST TITLE', {
    delay: 50,
  });
  await page.keyboard.press('Enter', { delay: 50 });
  await page.waitForTimeout(100);
  await page.keyboard.type('/', { delay: 50 });
  await expect(slashMenu).toBeVisible();
  await page.keyboard.type('image', { delay: 100 });
  await expect(slashMenu).toBeVisible();
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.keyboard.press('Enter', { delay: 50 });
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles(Path.dir(import.meta.url).join('logo.svg').value);
  await expect(image).toBeVisible();

  // the user should see the svg
  // get the image src under "affine-image img"
  const src1 = await page.locator('affine-image img').getAttribute('src');
  expect(src1).not.toBeNull();

  // fetch the actual src1 resource in the browser
  const svg1 = await page.evaluate(
    src =>
      fetch(src!)
        .then(res => res.blob())
        .then(blob => blob.text()),
    src1
  );

  {
    const context = await browser.newContext();
    await skipOnboarding(context);
    const page2 = await context.newPage();
    await loginUser(page2, user);
    await page2.goto(page.url());

    // second user should see the svg
    // get the image src under "affine-image img"
    const src2 = await page2.locator('affine-image img').getAttribute('src');
    expect(src2).not.toBeNull();

    // fetch the actual src2 resource in the browser
    const svg2 = await page2.evaluate(
      src =>
        fetch(src!)
          .then(res => res.blob())
          .then(blob => blob.text()),
      src2
    );

    expect(svg2).toEqual(svg1);
  }
});
