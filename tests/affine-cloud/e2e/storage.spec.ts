import { listBlobsQuery } from '@affine/graphql';
import { test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  deleteUser,
  enableCloudWorkspace,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import {
  getBlockSuiteEditorTitle,
  getPageByTitle,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
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

test.afterEach(async () => {
  // if you want to keep the user in the database for debugging,
  // comment this line
  await deleteUser(user.email);
});

test('should delete unused blobs after permanently deleting a doc', async ({
  page,
}) => {
  await enableCloudWorkspace(page);
  const title = 'Permanent deletion attachment';
  await getBlockSuiteEditorTitle(page).fill(title);
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    window.showOpenFilePicker = undefined;
  });
  const chooser = page.waitForEvent('filechooser');
  await page.keyboard.type('/attachment');
  await page.keyboard.press('Enter');
  await (
    await chooser
  ).setFiles({
    name: 'permanent-deletion.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'An attachment used only by the permanent deletion test.'
    ),
  });
  const attachment = page.locator('affine-attachment');
  await expect(attachment).toBeVisible();
  const blobKey = await attachment.evaluate(element => {
    return (
      element as HTMLElement & {
        model: { props: { sourceId$: { value: string } } };
      }
    ).model.props.sourceId$.value;
  });
  const workspaceId = new URL(page.url()).pathname.split('/')[2];
  const docId = new URL(page.url()).pathname.split('/')[3];
  const workspace = await page.evaluateHandle(() => {
    return (
      window as typeof window & {
        currentWorkspace?: {
          engine: {
            doc: {
              waitForSynced(docId: string): Promise<void>;
              storage: { getDoc(docId: string): Promise<unknown> };
            };
            blob: { upload(key: string): Promise<boolean> };
          };
        };
      }
    ).currentWorkspace;
  });
  await workspace.evaluate(
    async (current, { docId, blobKey }) => {
      if (!current) throw new Error('Workspace is unavailable');
      await current.engine.doc.waitForSynced(docId);
      await current.engine.blob.upload(blobKey);
    },
    { docId, blobKey }
  );
  const listKeys = async () => {
    const response = await page.request.post('/graphql', {
      data: {
        query: listBlobsQuery.query,
        variables: { workspaceId, first: 1000 },
      },
    });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.errors).toBeUndefined();
    return body.data.workspace.blobs.map((blob: { key: string }) => blob.key);
  };
  expect(await listKeys()).toContain(blobKey);

  await clickSideBarAllPageButton(page);
  await getPageByTitle(page, title)
    .getByTestId('doc-list-operation-button')
    .click();
  const deleteBtn = page.getByTestId('doc-list-operation-trash');
  await deleteBtn.click();
  await expect(page.getByText('Delete doc?')).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('trash-page').click();
  await getPageByTitle(page, title).getByTestId('delete-page-button').click();
  const confirmDelete = page.getByRole('dialog', {
    name: 'Delete permanently?',
  });
  await expect(confirmDelete).toBeVisible();
  await confirmDelete
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await expect(getPageByTitle(page, title)).toBeHidden();
  await expect(confirmDelete).toBeHidden();
  expect(
    await workspace.evaluate(async (current, id) => {
      if (!current) throw new Error('Workspace is unavailable');
      return current.engine.doc.storage.getDoc(id);
    }, docId)
  ).toBeNull();

  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await expect(page.getByTestId('setting-modal')).toBeVisible();
  await page.getByTestId('workspace-setting:storage').click();
  await expect(page.getByText(/Unused blobs \([1-9]\d*\)/)).toBeVisible();

  // get the unused blobs count
  const count = await page.getByText(/Unused blobs \(\d+\)/).textContent();
  const unusedBlobsCount = parseInt(count?.match(/\d+/)?.[0] ?? '0');

  expect(unusedBlobsCount).toBeGreaterThan(0);
  await expect(page.getByTestId('blob-preview-card')).toHaveCount(
    Math.min(9, unusedBlobsCount)
  );
  await page
    .getByTestId('blob-preview-card')
    .filter({ hasText: blobKey })
    .click();
  await expect(page.getByText('1 Selected')).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Delete blob files')).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();

  await expect(
    page.getByText(`Unused blobs (${unusedBlobsCount - 1})`)
  ).toBeVisible();
  expect(await listKeys()).not.toContain(blobKey);
});
