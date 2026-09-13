import test from 'ava';

import { DocMode } from '../../../models';
import { generateDocPath } from '../doc';

test('should generate doc path', t => {
  t.is(
    generateDocPath({
      workspaceId: 'ws',
      docId: 'doc',
      mode: DocMode.page,
    }),
    '/workspace/ws/doc?mode=page'
  );

  t.is(
    generateDocPath({
      workspaceId: 'ws',
      docId: 'doc',
      mode: DocMode.page,
      blockId: 'block',
    }),
    '/workspace/ws/doc?mode=page&blockIds=block'
  );

  t.is(
    generateDocPath({
      workspaceId: 'ws',
      docId: 'doc',
      mode: DocMode.page,
      elementId: 'element.+?aaa$!@#',
    }),
    '/workspace/ws/doc?mode=page&elementIds=element.%2B%3Faaa%24%21%40%23'
  );

  t.is(
    generateDocPath({
      workspaceId: 'ws',
      docId: 'doc',
      mode: DocMode.page,
      blockId: 'block',
      elementId: 'element',
    }),
    '/workspace/ws/doc?mode=page&elementIds=element&blockIds=block'
  );
});
