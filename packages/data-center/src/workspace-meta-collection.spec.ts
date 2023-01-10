import { test, expect } from '@playwright/test';
import { WorkspaceMetaCollection } from './workspace-meta-collection.js';
import type { WorkspaceMetaCollectionChangeEvent } from './workspace-meta-collection';

test.describe.serial('workspace meta collection observable', () => {
  const workspaces = new WorkspaceMetaCollection();

  const scope = workspaces.createScope();

  test('add workspace', () => {
    workspaces.once('change', (event: WorkspaceMetaCollectionChangeEvent) => {
      expect(event.added?.id).toEqual('123');
    });
    scope.add({
      id: '123',
      name: 'test',
      memberCount: 1,
      provider: '',
    });
  });

  test('list workspace', () => {
    const list = scope.list();
    expect(list.length).toEqual(1);
    expect(list[0].id).toEqual('123');
  });

  test('get workspace', () => {
    expect(scope.get('123')?.id).toEqual('123');
  });

  test('update workspace', () => {
    workspaces.once('change', (event: WorkspaceMetaCollectionChangeEvent) => {
      expect(event.updated?.name).toEqual('demo');
    });
    scope.update('123', { name: 'demo' });
  });

  test('get workspace form other scope', () => {
    const scope1 = workspaces.createScope();
    expect(scope1.get('123')).toBeFalsy();
  });

  test('delete workspace', () => {
    workspaces.once('change', (event: WorkspaceMetaCollectionChangeEvent) => {
      expect(event.deleted?.id).toEqual('123');
    });
    scope.remove('123');
  });
});
