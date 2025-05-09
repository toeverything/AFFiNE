import test from 'ava';

import { DocID } from '../../utils/doc';
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

  t.deepEqual(builder.user('u1').workspace('ws1').allowLocal().data, {
    allowLocal: true,
    userId: 'u1',
    workspaceId: 'ws1',
  });
});

test('should build correct doc resource', t => {
  const resources = [
    builder.user('u1').workspace('ws1').doc('doc1').data,
    builder.user('u1').doc('ws1', 'doc1').data,
    builder.user('u1').doc({ workspaceId: 'ws1', docId: 'doc1' }).data,
    builder.user('u1').doc(new DocID('ws1:space:doc1', 'ws1')).data,
  ];

  t.deepEqual(
    resources,
    Array.from({ length: 4 }, () => ({
      userId: 'u1',
      workspaceId: 'ws1',
      docId: 'doc1',
    }))
  );

  t.deepEqual(builder.user('u1').doc('ws1', 'doc1').allowLocal().data, {
    allowLocal: true,
    docId: 'doc1',
    userId: 'u1',
    workspaceId: 'ws1',
  });
});
