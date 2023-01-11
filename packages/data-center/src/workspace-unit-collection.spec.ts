import { test, expect } from '@playwright/test';
import { WorkspaceUnitCollection } from './workspace-unit-collection.js';
import type { WorkspaceUnitCollectionChangeEvent } from './workspace-unit-collection';

test.describe.serial('workspace meta collection observable', () => {
  const workspaceUnitCollection = new WorkspaceUnitCollection();

  const scope = workspaceUnitCollection.createScope();

  test('add workspace', () => {
    workspaceUnitCollection.once(
      'change',
      (event: WorkspaceUnitCollectionChangeEvent) => {
        expect(event.added?.[0]?.id).toEqual('123');
      }
    );
    scope.add({
      id: '123',
      name: 'test',
      memberCount: 1,
      provider: '',
      syncMode: 'core',
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
    workspaceUnitCollection.once(
      'change',
      (event: WorkspaceUnitCollectionChangeEvent) => {
        expect(event.updated?.name).toEqual('demo');
      }
    );
    scope.update('123', { name: 'demo' });
  });

  test('get workspace form other scope', () => {
    const scope1 = workspaceUnitCollection.createScope();
    expect(scope1.get('123')).toBeFalsy();
  });

  test('delete workspace', () => {
    workspaceUnitCollection.once(
      'change',
      (event: WorkspaceUnitCollectionChangeEvent) => {
        expect(event.deleted?.id).toEqual('123');
      }
    );
    scope.remove('123');
  });
});
