import test from 'ava';

import { ActionForbidden } from '../../../base';
import { assertAccessTokenCanUseDocAction } from '../scopes';

test('unscoped access token allows doc action checks', t => {
  t.notThrows(() =>
    assertAccessTokenCanUseDocAction(
      { scopes: null } as any,
      'workspace',
      'doc',
      'Doc.Users.Manage'
    )
  );
});

test('scoped access token allows matching doc action', t => {
  t.notThrows(() =>
    assertAccessTokenCanUseDocAction(
      {
        scopes: {
          docs: [
            {
              workspaceId: 'workspace',
              docId: 'doc',
              actions: ['Doc.Users.Manage'],
            },
          ],
        },
      } as any,
      'workspace',
      'doc',
      'Doc.Users.Manage'
    )
  );
});

test('scoped access token rejects mismatched doc action', t => {
  t.throws(
    () =>
      assertAccessTokenCanUseDocAction(
        {
          scopes: {
            docs: [
              {
                workspaceId: 'workspace',
                docId: 'doc',
                actions: ['Doc.Read'],
              },
            ],
          },
        } as any,
        'workspace',
        'doc',
        'Doc.Users.Manage'
      ),
    { instanceOf: ActionForbidden }
  );
});

test('scoped access token rejects mismatched doc resource', t => {
  t.throws(
    () =>
      assertAccessTokenCanUseDocAction(
        {
          scopes: {
            docs: [
              {
                workspaceId: 'workspace',
                docId: 'other-doc',
                actions: ['Doc.Users.Manage'],
              },
            ],
          },
        } as any,
        'workspace',
        'doc',
        'Doc.Users.Manage'
      ),
    { instanceOf: ActionForbidden }
  );
});

test('workspace-level doc scope allows any doc in workspace', t => {
  t.notThrows(() =>
    assertAccessTokenCanUseDocAction(
      {
        scopes: {
          docs: [
            {
              workspaceId: 'workspace',
              docId: null,
              actions: ['Doc.Update'],
            },
          ],
        },
      } as any,
      'workspace',
      'doc',
      'Doc.Update'
    )
  );
});
