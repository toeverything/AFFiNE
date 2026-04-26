import test from 'ava';
import { applyUpdate, Doc as YDoc, encodeStateAsUpdate } from 'yjs';

import { DocActionDenied, DocNotFound } from '../../../base';
import { DocRole } from '../../../models';
import { AnonymousDocAccessService } from '../service';

function createService(
  snapshot: unknown = { id: 'doc' },
  recordedUpdates: Buffer[] = [],
  currentDocUpdate: Buffer | null = null
) {
  return new AnonymousDocAccessService(
    {
      snapshot: {
        findUnique: async () => snapshot,
      },
      $queryRaw: async () => recordedUpdates.map(update => ({ update })),
    } as any,
    {
      getDocDiff: async () =>
        currentDocUpdate
          ? {
              missing: currentDocUpdate,
              state: new Uint8Array(),
              timestamp: Date.now(),
            }
          : null,
    } as any
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
    service.assertCanReadBlob(editorPrincipal, 'workspace', 'assets/file.png'),
    { instanceOf: DocNotFound }
  );
});

test('anonymous blob read allows source doc blobs', async t => {
  const service = createService();

  await t.notThrowsAsync(
    service.assertCanReadBlob(editorPrincipal, 'workspace', 'assets/file.png')
  );
});

test('anonymous blob read rejects another anonymous doc namespace', async t => {
  const service = createService();

  await t.throwsAsync(
    service.assertCanReadBlob(
      editorPrincipal,
      'workspace',
      'anonymous-doc/other-doc/file.png'
    ),
    { instanceOf: DocActionDenied }
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

test('anonymous update can delete guest-owned content', async t => {
  const guestDoc = new YDoc();
  const blocks = guestDoc.getMap('blocks');
  let createUpdate: Buffer | null = null;
  let deleteUpdate: Buffer | null = null;

  guestDoc.on('update', update => {
    if (!createUpdate) {
      createUpdate = Buffer.from(update);
    } else {
      deleteUpdate = Buffer.from(update);
    }
  });
  blocks.set('guest-block', 'guest content');
  blocks.delete('guest-block');

  const service = createService({ id: 'doc' }, [createUpdate!]);

  await t.notThrowsAsync(
    service.assertUpdatesDeleteOnlyGuestContent(editorPrincipal, [
      deleteUpdate!,
    ])
  );
});

test('anonymous update rejects deleting admin-owned content', async t => {
  const adminDoc = new YDoc();
  const blocks = adminDoc.getMap('blocks');
  let adminUpdate: Buffer | null = null;
  adminDoc.on('update', update => {
    adminUpdate = Buffer.from(update);
  });
  blocks.set('admin-block', 'admin content');

  const guestDoc = new YDoc();
  applyUpdate(guestDoc, adminUpdate!);
  let deleteUpdate: Buffer | null = null;
  guestDoc.on('update', update => {
    deleteUpdate = Buffer.from(update);
  });
  guestDoc.getMap('blocks').delete('admin-block');

  const service = createService();

  await t.throwsAsync(
    service.assertUpdatesDeleteOnlyGuestContent(editorPrincipal, [
      deleteUpdate!,
    ]),
    { instanceOf: DocActionDenied }
  );
});

test('anonymous update allows anonymous image blob insertion side effects', async t => {
  const adminDoc = new YDoc();
  const blocks = adminDoc.getMap('blocks');
  let adminUpdate: Buffer | null = null;
  adminDoc.on('update', update => {
    adminUpdate = Buffer.from(update);
  });
  blocks.set('admin-block', 'admin content');

  const guestDoc = new YDoc();
  applyUpdate(guestDoc, adminUpdate!);
  let guestUpdate: Buffer | null = null;
  guestDoc.on('update', update => {
    guestUpdate = Buffer.from(update);
  });
  guestDoc.getMap('blocks').delete('admin-block');
  guestDoc.getMap('blocks').set('image-block', 'anonymous-doc/doc/image.png');

  const service = createService();

  await t.notThrowsAsync(
    service.assertUpdatesDeleteOnlyGuestContent(editorPrincipal, [guestUpdate!])
  );
});

test('anonymous update ignores delete ranges already present in current doc', async t => {
  const adminDoc = new YDoc();
  adminDoc.getMap('blocks').set('old-admin-block', 'admin content');
  adminDoc.getMap('blocks').delete('old-admin-block');
  const currentDocUpdate = Buffer.from(encodeStateAsUpdate(adminDoc));

  const guestDoc = new YDoc();
  applyUpdate(guestDoc, currentDocUpdate);
  let guestUpdate: Buffer | null = null;
  guestDoc.on('update', update => {
    guestUpdate = Buffer.from(update);
  });
  guestDoc.getMap('blocks').set('guest-block', 'guest content');

  const service = createService({ id: 'doc' }, [], currentDocUpdate);

  await t.notThrowsAsync(
    service.assertUpdatesDeleteOnlyGuestContent(editorPrincipal, [guestUpdate!])
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
