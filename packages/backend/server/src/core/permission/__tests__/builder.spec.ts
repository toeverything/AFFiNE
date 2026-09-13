import test from 'ava';

import { AccessControllerBuilder } from '../builder';

let builder: AccessControllerBuilder;

test.before(async () => {
  builder = new AccessControllerBuilder();
});

test('should build correct workspace resource', t => {
  t.deepEqual(builder.user('u1').workspace('ws1').data, {
    userId: 'u1',
    workspaceId: 'ws1',
  });
});

test('should build correct doc resource', t => {
  const resources = [
    builder.user('u1').workspace('ws1').doc('doc1').data,
    builder.user('u1').doc('ws1', 'doc1').data,
    builder.user('u1').doc({ workspaceId: 'ws1', docId: 'doc1' }).data,
  ];

  t.deepEqual(
    resources,
    Array.from({ length: 3 }, () => ({
      userId: 'u1',
      workspaceId: 'ws1',
      docId: 'doc1',
    }))
  );
});
