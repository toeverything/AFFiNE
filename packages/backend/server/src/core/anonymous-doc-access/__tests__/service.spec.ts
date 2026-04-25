import test from 'ava';
import { applyUpdate, Doc as YDoc } from 'yjs';

import { DocActionDenied, DocNotFound } from '../../../base';
import { DocRole } from '../../../models';
import { AnonymousDocAccessService } from '../service';

function createService(snapshot: unknown = { id: 'doc' }) {
  return new AnonymousDocAccessService(
    {
      snapshot: {
        findUnique: async () => snapshot,
      },
    } as any,
    {} as any
  );
}

const editorPrincipal = {
  linkId: 'link',
  guestSessionId: 'session',
  guestId: 'guest',
  workspaceId: 'workspace',
  docId: 'doc',
  role: DocRole.Editor,
};

test('anonymous doc link rejects workspace root doc', async t => {
  const service = createService();

  await t.throwsAsync(service.createLink('workspace', 'workspace', 'user'), {
    instanceOf: DocActionDenied,
  });
});

test('anonymous doc link rejects system docs', async t => {
  const service = createService();

  await t.throwsAsync(
    service.createLink('workspace', 'db$another-workspace$root', 'user'),
    { instanceOf: DocActionDenied }
  );
  await t.throwsAsync(
    service.createLink('workspace', 'userdata$user', 'user'),
    { instanceOf: DocActionDenied }
  );
});

test('anonymous blob write requires anonymous blob namespace', async t => {
  const service = createService();

  await t.throwsAsync(
    service.assertCanWriteBlob(editorPrincipal, 'workspace', 'assets/file.png'),
    { instanceOf: DocActionDenied }
  );
});

test('anonymous blob write requires existing shared doc', async t => {
  const service = createService(null);

  await t.throwsAsync(
    service.assertCanWriteBlob(
      editorPrincipal,
      'workspace',
      'anonymous-doc/doc/file.png'
    ),
    { instanceOf: DocNotFound }
  );
});

test('anonymous blob read requires existing shared doc', async t => {
  const service = createService(null);

  await t.throwsAsync(
    service.assertCanReadBlob(
      editorPrincipal,
      'workspace',
      'anonymous-doc/doc/file.png'
    ),
    { instanceOf: DocNotFound }
  );
});

test('anonymous projected root doc exposes YMap page metadata', async t => {
  const service = createService();
  const diff = await service.getDocDiff(
    editorPrincipal,
    'workspace',
    'workspace'
  );
  const rootDoc = new YDoc({ guid: 'workspace' });
  applyUpdate(rootDoc, diff.missing);

  const pages = rootDoc.getMap('meta').get('pages') as {
    get(index: number): {
      get(key: string): unknown;
    };
  };
  const page = pages.get(0);
  t.is(page.get('id'), 'doc');
});

test('anonymous projected root doc is read-only', async t => {
  const service = createService();

  t.notThrows(() =>
    service.assertCanAccessDoc(editorPrincipal, 'workspace', 'workspace')
  );
  await t.throwsAsync(
    service.assertCanWriteDoc(editorPrincipal, 'workspace', 'workspace'),
    { instanceOf: DocActionDenied }
  );
});

test('anonymous shared doc remains writable for editor', async t => {
  const service = createService();

  await t.notThrowsAsync(
    service.assertCanWriteDoc(editorPrincipal, 'workspace', 'doc')
  );
});

test('anonymous system docs are synthetic and read-only', async t => {
  const service = createService();
  const systemDocId = 'db$workspace$pinnedCollections';
  const diff = await service.getDocDiff(
    editorPrincipal,
    'workspace',
    systemDocId
  );
  const systemDoc = new YDoc({ guid: systemDocId });
  applyUpdate(systemDoc, diff.missing);

  t.true(service.isReadOnlySyntheticDoc('workspace', systemDocId));
  t.is(systemDoc.guid, systemDocId);
  await t.throwsAsync(
    service.assertCanWriteDoc(editorPrincipal, 'workspace', systemDocId),
    { instanceOf: DocActionDenied }
  );
});
