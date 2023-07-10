/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import type { WorkspaceCRUD } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
import { assertExists } from '@blocksuite/global/utils';
import { Workspace } from '@blocksuite/store';
import { afterEach, assertType, describe, expect, test } from 'vitest';

import { CRUD } from '../crud';

afterEach(() => {
  localStorage.clear();
});

describe('crud', () => {
  test('type', () => {
    assertType<WorkspaceCRUD<WorkspaceFlavour.LOCAL>>(CRUD);
  });

  test('basic', async () => {
    const workspace = await CRUD.get('not_exist');
    expect(workspace).toBeNull();

    expect(await CRUD.list()).toEqual([]);
  });

  test('delete not exist', async () => {
    await expect(async () =>
      CRUD.delete(new Workspace({ id: 'test' }))
    ).rejects.toThrowError();
  });

  test('create & delete', async () => {
    const workspace = new Workspace({ id: 'test' })
      .register(AffineSchemas)
      .register(__unstableSchemas);
    const page = workspace.createPage({ id: 'page0' });
    await page.waitForLoaded();
    const pageBlockId = page.addBlock('affine:page', {
      title: new page.Text(''),
    });
    page.addBlock('affine:surface', {}, pageBlockId);
    const frameId = page.addBlock('affine:note', {}, pageBlockId);
    page.addBlock('affine:paragraph', {}, frameId);

    const id = await CRUD.create(workspace);
    const list = await CRUD.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(id);
    const localWorkspace = list.at(0);
    assertExists(localWorkspace);
    expect(localWorkspace.id).toBe(id);
    expect(localWorkspace.flavour).toBe(WorkspaceFlavour.LOCAL);
    expect(localWorkspace.blockSuiteWorkspace.doc.toJSON()).toEqual({
      meta: expect.anything(),
      spaces: expect.objectContaining({
        'space:page0': expect.anything(),
      }),
    });

    await CRUD.delete(localWorkspace.blockSuiteWorkspace);
    expect(await CRUD.get(id)).toBeNull();
    expect(await CRUD.list()).toEqual([]);
  });
});
