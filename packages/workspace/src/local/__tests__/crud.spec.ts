/**
 * @vitest-environment happy-dom
 */
import 'fake-indexeddb/auto';

import type { LocalWorkspace, WorkspaceCRUD } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { __unstableSchemas, AffineSchemas } from '@blocksuite/blocks/models';
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
    expect(async () =>
      CRUD.delete({
        id: 'not_exist',
        flavour: WorkspaceFlavour.LOCAL,
        blockSuiteWorkspace: new Workspace({ id: 'test' }),
        providers: [],
      })
    ).rejects.toThrowError();
  });

  test('create & delete', async () => {
    const workspace = new Workspace({ id: 'test' })
      .register(AffineSchemas)
      .register(__unstableSchemas);
    const page = workspace.createPage('test');
    const pageBlockId = page.addBlock('affine:page', {
      title: new page.Text(''),
    });
    page.addBlock('affine:surface', {}, pageBlockId);
    const frameId = page.addBlock('affine:frame', {}, pageBlockId);
    page.addBlock('affine:paragraph', {}, frameId);

    const id = await CRUD.create(workspace);
    const list = await CRUD.list();
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(id);
    const localWorkspace = list.at(0) as LocalWorkspace;
    expect(localWorkspace.id).toBe(id);
    expect(localWorkspace.flavour).toBe(WorkspaceFlavour.LOCAL);
    expect(
      Workspace.Y.encodeStateAsUpdate(localWorkspace.blockSuiteWorkspace.doc)
    ).toEqual(Workspace.Y.encodeStateAsUpdate(workspace.doc));

    await CRUD.delete(localWorkspace);
    expect(await CRUD.get(id)).toBeNull();
    expect(await CRUD.list()).toEqual([]);
  });
});
