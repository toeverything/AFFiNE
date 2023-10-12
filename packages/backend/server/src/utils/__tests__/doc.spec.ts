import test from 'ava';

import { DocID, DocVariant } from '../doc';

test('can parse', t => {
  // workspace only
  let id = new DocID('ws');

  t.is(id.workspace, 'ws');
  t.assert(id.isWorkspace);

  // full id
  id = new DocID('ws:space:sub');

  t.is(id.workspace, 'ws');
  t.is(id.variant, DocVariant.Space);
  t.is(id.guid, 'sub');

  // variant only
  id = new DocID('space:sub', 'ws');

  t.is(id.workspace, 'ws');
  t.is(id.variant, DocVariant.Space);
  t.is(id.guid, 'sub');

  // sub id only
  id = new DocID('sub', 'ws');

  t.is(id.workspace, 'ws');
  t.is(id.variant, DocVariant.Unknown);
  t.is(id.guid, 'sub');
});

test('fail', t => {
  t.throws(() => new DocID('a:b:c:d'), {
    message: 'Invalid format of Doc ID: a:b:c:d',
  });
  t.throws(() => new DocID(':space:sub'), { message: 'Workspace is required' });
  t.throws(() => new DocID('space:sub'), { message: 'Workspace is required' });
  t.throws(() => new DocID('ws:any:sub'), {
    message: 'Invalid ID variant: any',
  });
  t.throws(() => new DocID('ws:space:'), {
    message: 'ID is required for non-workspace doc',
  });
  t.throws(() => new DocID('ws::space'), {
    message: 'Variant is required for non-workspace doc',
  });
});

test('fix', t => {
  let id = new DocID('ws');
  // can't fix because the doc variant is [Workspace]
  id.fixWorkspace('ws2');
  t.is(id.workspace, 'ws');
  t.is(id.toString(), 'ws');

  id = new DocID('ws:space:sub');

  id.fixWorkspace('ws2');

  t.is(id.workspace, 'ws2');
  t.is(id.toString(), 'ws2:space:sub');

  id = new DocID('space:sub', 'ws');
  t.is(id.workspace, 'ws');
  t.is(id.toString(), 'ws:space:sub');

  id = new DocID('ws2:space:sub', 'ws');
  t.is(id.workspace, 'ws');
  t.is(id.toString(), 'ws:space:sub');
});
