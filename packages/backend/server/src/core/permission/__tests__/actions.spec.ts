import test from 'ava';

import { permissionActionCatalogV1 } from '../../../native';
import { Action, DOC_ACTIONS, WORKSPACE_ACTIONS } from '../types';

test('Node action visitor exposes the canonical action names', t => {
  for (const [actual, expected] of [
    [Action.Workspace.CreateDoc, 'Workspace.CreateDoc'],
    [Action.Workspace.Users.Read, 'Workspace.Users.Read'],
    [Action.Doc.Copy, 'Doc.Copy'],
    [Action.Doc.Users.Manage, 'Doc.Users.Manage'],
  ]) {
    t.is(actual, expected);
  }
});

test('TypeScript action facade exactly matches the native core catalog', t => {
  const catalog = permissionActionCatalogV1();
  t.deepEqual(WORKSPACE_ACTIONS.toSorted(), catalog.workspace.toSorted());
  t.deepEqual(DOC_ACTIONS.toSorted(), catalog.doc.toSorted());
});
