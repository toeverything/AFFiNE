import { NotFoundException } from '@nestjs/common';
import { McpAccessMode } from '@prisma/client';
import test from 'ava';
import {
  applyUpdate,
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  Map as YMap,
} from 'yjs';

import { DocCreateIncompleteError, DocWriter } from '../../core/doc/writer';
import {
  createDocWithMarkdown,
  extractWorkspaceLifecycleRootPages,
  mergeUpdates,
  updateDocProperties,
} from '../../native';
import { WorkspaceMcpProvider } from '../../plugins/copilot/mcp/provider';
import { executeToolCall } from '../../plugins/copilot/runtime/tool/bridge';
import {
  buildDocCreateHandler,
  buildDocUpdateHandler,
  buildDocUpdateMetaHandler,
  createDocCreateTool,
} from '../../plugins/copilot/tools/doc-write';

function createLegacyArrayRootDoc(pages: Array<Record<string, unknown>>) {
  const doc = new YDoc();
  doc.getMap('meta').set('pages', pages);
  return Buffer.from(encodeStateAsUpdate(doc));
}

function createWriterHarness(
  initialDocs: Map<string, Uint8Array>,
  options?: {
    initialEditors?: Map<string, string>;
    initialCreators?: Map<string, string>;
    onBeforePush?: (params: {
      workspaceId: string;
      docId: string;
      updates: Uint8Array[];
      expectedCurrentTimestamp?: number;
    }) => Promise<void> | void;
  }
) {
  const pushed: Array<{
    docId: string;
    updates: Uint8Array[];
    editor?: string;
  }> = [];
  const emitted: Array<{ docId: string; updates: Uint8Array[] }> = [];
  const timestamps = new Map<string, number>();
  const editors = new Map<string, string>(options?.initialEditors);
  const creators = new Map<string, string>(options?.initialCreators);
  let clock = 1000;
  for (const docId of initialDocs.keys()) {
    timestamps.set(docId, clock);
  }

  const storage = {
    isEmptyBin(bin: Uint8Array) {
      return (
        bin.length === 0 ||
        (bin.length === 1 && bin[0] === 0) ||
        (bin.length === 2 && bin[0] === 0 && bin[1] === 0)
      );
    },
    async getDoc(_workspaceId: string, docId: string) {
      const bin = initialDocs.get(docId);
      if (!bin) return null;
      return {
        spaceId: _workspaceId,
        docId,
        bin,
        timestamp: timestamps.get(docId) ?? 0,
        editor: editors.get(docId),
        creator: creators.get(docId),
      };
    },
    async pushDocUpdates(
      workspaceId: string,
      docId: string,
      updates: Uint8Array[],
      editorId?: string,
      _expectedPermissionGeneration?: number,
      _writeIntent?: 'update_doc' | 'create_doc',
      _protocolVersion?: number,
      expectedCurrentTimestamp?: number
    ) {
      await options?.onBeforePush?.({
        workspaceId,
        docId,
        updates,
        expectedCurrentTimestamp,
      });
      const currentTs = timestamps.get(docId) ?? 0;
      if (
        expectedCurrentTimestamp !== undefined &&
        currentTs !== expectedCurrentTimestamp
      ) {
        throw new Error('doc_revision_conflict');
      }
      pushed.push({ docId, updates, editor: editorId });
      const prev = initialDocs.get(docId);
      const next = prev
        ? mergeUpdates([Buffer.from(prev), ...updates.map(Buffer.from)])
        : updates.length === 1
          ? Buffer.from(updates[0])
          : mergeUpdates(updates.map(Buffer.from));
      initialDocs.set(docId, next);
      if (editorId) {
        if (!prev && !creators.has(docId)) {
          creators.set(docId, editorId);
        }
        editors.set(docId, editorId);
      }
      clock += 1;
      timestamps.set(docId, clock);
      return { timestamp: clock, created: !prev };
    },
    async pushDocUpdatesTrusted(
      workspaceId: string,
      docId: string,
      updates: Uint8Array[],
      editorId?: string,
      expectedCurrentTimestamp?: number
    ) {
      const { timestamp } = await this.pushDocUpdates(
        workspaceId,
        docId,
        updates,
        editorId,
        undefined,
        undefined,
        undefined,
        expectedCurrentTimestamp
      );
      return timestamp;
    },
  };

  const event = {
    emit(_name: string, payload: { docId: string; updates: Uint8Array[] }) {
      emitted.push({ docId: payload.docId, updates: payload.updates });
    },
  };

  const runtime = {
    async getWorkspaceLifecycleActiveV1() {
      return false;
    },
  };

  const createWriter = () =>
    new DocWriter(storage as any, event as any, runtime as any);
  const writer = createWriter();
  return { writer, createWriter, storage, pushed, emitted, initialDocs };
}

test('createDoc migrates legacy Any::Array root doc and registers new doc', async t => {
  const workspaceId = 'ws-legacy-migrate';
  const docs = new Map<string, Uint8Array>([
    [
      workspaceId,
      createLegacyArrayRootDoc([{ id: 'existing-doc', title: 'Existing' }]),
    ],
  ]);
  const { writer, pushed, initialDocs } = createWriterHarness(docs);

  const { docId } = await writer.createDoc(
    workspaceId,
    'Fresh Title',
    '# Fresh Title\n\nBody',
    'user-1'
  );

  t.truthy(docId);
  const rootPushes = pushed.filter(p => p.docId === workspaceId);
  t.is(
    rootPushes.length,
    1,
    'should push migration update and addDoc update in one atomic batch'
  );
  t.is(rootPushes[0].updates.length, 2);

  const finalRoot = initialDocs.get(workspaceId)!;
  const pages = extractWorkspaceLifecycleRootPages(Buffer.from(finalRoot));
  t.deepEqual(
    pages.map(p => p.docId),
    ['existing-doc', docId]
  );
});

test('concurrent DocWriter instances coordinate legacy root migration via CAS even with interleaved root write', async t => {
  const workspaceId = 'ws-concurrent-cas';
  const docs = new Map<string, Uint8Array>([
    [
      workspaceId,
      createLegacyArrayRootDoc([{ id: 'existing-doc', title: 'Existing' }]),
    ],
  ]);

  let interleavedInjected = false;
  let rootPushAttempts = 0;
  let harness!: ReturnType<typeof createWriterHarness>;
  harness = createWriterHarness(docs, {
    async onBeforePush({ docId }) {
      if (docId !== workspaceId) return;
      rootPushAttempts += 1;
      if (!interleavedInjected && rootPushAttempts === 1) {
        interleavedInjected = true;
        // Inject an unrelated normal root doc write between read and commit to force CAS retry.
        const extra = new YDoc();
        extra.getMap('meta').set('name', 'Interleaved Workspace Name');
        await harness.storage.pushDocUpdates(
          workspaceId,
          workspaceId,
          [Buffer.from(encodeStateAsUpdate(extra))],
          'interleaver'
        );
      }
    },
  });

  const writerA = harness.createWriter();
  const writerB = harness.createWriter();

  const [resA, resB] = await Promise.all([
    writerA.createDoc(workspaceId, 'Doc A', '# Doc A', 'user-a'),
    writerB.createDoc(workspaceId, 'Doc B', '# Doc B', 'user-b'),
  ]);

  const finalRoot = harness.initialDocs.get(workspaceId)!;
  const pages = extractWorkspaceLifecycleRootPages(Buffer.from(finalRoot));
  const pageIds = pages.map(p => p.docId);
  t.is(pageIds.length, 3);
  t.is(new Set(pageIds).size, 3, 'no duplicate page ids');
  t.true(pageIds.includes('existing-doc'));
  t.true(pageIds.includes(resA.docId));
  t.true(pageIds.includes(resB.docId));

  // Verify the migration batch only committed once across both instances.
  const migrationBatches = harness.pushed.filter(
    p => p.docId === workspaceId && p.updates.length === 2
  );
  t.is(migrationBatches.length, 1);
});

test('createDoc rejects on root push DB error and registerDocInRootDoc recovers idempotently', async t => {
  const workspaceId = 'ws-root-db-error';
  const docs = new Map<string, Uint8Array>([
    [
      workspaceId,
      createLegacyArrayRootDoc([{ id: 'existing-doc', title: 'Existing' }]),
    ],
  ]);

  let failRootPush = true;
  const { writer, initialDocs } = createWriterHarness(docs, {
    async onBeforePush({ docId }) {
      if (docId === workspaceId && failRootPush) {
        throw new Error('pg_connection_lost');
      }
    },
  });

  const err = await t.throwsAsync(
    () => writer.createDoc(workspaceId, 'Recoverable Doc', '# Body', 'user-1'),
    { instanceOf: DocCreateIncompleteError, message: /pg_connection_lost/ }
  );
  const createdDocId = err?.docId;
  t.truthy(createdDocId);

  failRootPush = false;
  await writer.registerDocInRootDoc(
    workspaceId,
    createdDocId!,
    'Recoverable Doc',
    'user-1'
  );
  // Second call for the same docId is idempotent.
  await writer.registerDocInRootDoc(
    workspaceId,
    createdDocId!,
    'Recoverable Doc',
    'user-1'
  );

  const pages = extractWorkspaceLifecycleRootPages(
    Buffer.from(initialDocs.get(workspaceId)!)
  );
  t.deepEqual(
    pages.map(p => p.docId),
    ['existing-doc', createdDocId!]
  );
});

function createPermissionMock(options?: { denyDocUpdateUsers?: Set<string> }) {
  const denied = options?.denyDocUpdateUsers ?? new Set<string>();
  return {
    user(userId: string) {
      return {
        workspace(_workspaceId: string) {
          return {
            async assert(_action: string) {},
            doc(_docId: string) {
              return {
                async assert(action: string) {
                  if (action === 'Doc.Update' && denied.has(userId)) {
                    throw new Error('Doc.Update access denied');
                  }
                },
                async can(action: string) {
                  return !(action === 'Doc.Update' && denied.has(userId));
                },
              };
            },
          };
        },
      };
    },
  };
}

function readDocProperties(
  docs: Map<string, Uint8Array>,
  workspaceId: string,
  docId: string
): { createdBy?: string; updatedBy?: string } {
  const bin = docs.get(`db$${workspaceId}$docProperties`);
  if (!bin) return {};
  const ydoc = new YDoc();
  applyUpdate(ydoc, bin);
  const entry = ydoc.getMap(docId);
  return {
    createdBy: entry.get('createdBy') as string | undefined,
    updatedBy: entry.get('updatedBy') as string | undefined,
  };
}

test('MCP create_document recovers incomplete registration as collaborator without overwriting creator/updater or creating missing docs', async t => {
  const workspaceId = 'ws-mcp-recover';
  const propertiesDocId = `db$${workspaceId}$docProperties`;
  const docs = new Map<string, Uint8Array>([
    [
      workspaceId,
      createLegacyArrayRootDoc([{ id: 'existing-doc', title: 'Existing' }]),
    ],
  ]);

  // Breakpoint 1: fail updateDocProperties right after body push succeeds.
  let failPropertiesPush = true;
  const { writer, storage, pushed, initialDocs } = createWriterHarness(docs, {
    async onBeforePush({ docId }) {
      if (docId === propertiesDocId && failPropertiesPush) {
        throw new Error('pg_connection_lost');
      }
    },
  });

  const reader = {
    getDoc: (wsId: string, docId: string) => storage.getDoc(wsId, docId),
  };
  const ac = createPermissionMock({
    denyDocUpdateUsers: new Set(['unauthorized-user']),
  });
  const provider = new WorkspaceMcpProvider(
    ac as any,
    reader as any,
    writer,
    {} as any
  );

  const prevEnv = (globalThis as any).env;
  (globalThis as any).env = {
    ...prevEnv,
    dev: true,
    namespaces: { ...prevEnv?.namespaces, canary: true },
  };

  try {
    const authorServer = await provider.for(
      'user-1',
      workspaceId,
      McpAccessMode.READ_WRITE
    );
    const authorCreateTool = authorServer.tools.find(
      tool => tool.name === 'create_document'
    )!;

    // 1. Author's initial call fails during properties write; parse docId strictly from error payload.
    const first = await authorCreateTool.execute(
      { title: 'MCP Recoverable', content: '# MCP Recoverable\n\nBody text' },
      { signal: new AbortController().signal }
    );
    t.true(first.isError);
    const errorPayload = JSON.parse(first.content[0].text) as {
      success: boolean;
      code: string;
      retryable: boolean;
      docId: string;
      message: string;
    };
    t.false(errorPayload.success);
    t.is(errorPayload.code, 'doc_create_incomplete');
    t.true(errorPayload.retryable);
    const recoveredDocId = errorPayload.docId;
    t.truthy(recoveredDocId);

    // 2. Restore DB and let a DIFFERENT authorized collaborator recover (and replay twice).
    failPropertiesPush = false;
    const collabServer = await provider.for(
      'collaborator-2',
      workspaceId,
      McpAccessMode.READ_WRITE
    );
    const collabCreateTool = collabServer.tools.find(
      tool => tool.name === 'create_document'
    )!;

    for (let replay = 0; replay < 2; replay++) {
      const res = await collabCreateTool.execute(
        {
          title: 'Collaborator Fallback Title',
          content: 'Ignored content',
          docId: recoveredDocId,
        },
        { signal: new AbortController().signal }
      );
      t.falsy(res.isError);
      const payload = JSON.parse(res.content[0].text) as {
        success: boolean;
        docId: string;
      };
      t.true(payload.success);
      t.is(payload.docId, recoveredDocId);
    }

    // Body pushed only once; creator/updater preserved as original author 'user-1'.
    t.is(pushed.filter(p => p.docId === recoveredDocId).length, 1);
    t.deepEqual(readDocProperties(initialDocs, workspaceId, recoveredDocId), {
      createdBy: 'user-1',
      updatedBy: 'user-1',
    });

    const pages = extractWorkspaceLifecycleRootPages(
      Buffer.from(initialDocs.get(workspaceId)!)
    );
    t.deepEqual(
      pages.map(p => p.docId),
      ['existing-doc', recoveredDocId]
    );

    // 3. After a third editor updates the doc, collaborator calling create_document with docId
    //    must leave createdBy/updatedBy and body completely untouched.
    await writer.updateDocMeta(
      workspaceId,
      recoveredDocId,
      { title: 'Updated Title by editor-3' },
      'editor-3'
    );
    const pushCountBeforeNoop = pushed.length;
    const noopRes = await collabCreateTool.execute(
      {
        title: 'Should Not Overwrite',
        content: 'Should Not Overwrite',
        docId: recoveredDocId,
      },
      { signal: new AbortController().signal }
    );
    t.falsy(noopRes.isError);
    t.is(
      pushed.length,
      pushCountBeforeNoop,
      'no storage writes on already-complete doc'
    );
    t.deepEqual(readDocProperties(initialDocs, workspaceId, recoveredDocId), {
      createdBy: 'user-1',
      updatedBy: 'editor-3',
    });

    // 4. Negative cases: nonexistent docId fails with not found without creating any doc.
    const missingRes = await collabCreateTool.execute(
      { title: 'Ghost', content: 'Body', docId: 'nonexistent-doc-id' },
      { signal: new AbortController().signal }
    );
    t.true(missingRes.isError);
    t.regex(missingRes.content[0].text, /not found/i);
    t.false(initialDocs.has('nonexistent-doc-id'));

    // Reserved IDs rejected.
    const reservedRes = await authorCreateTool.execute(
      { title: 'Bad', content: 'Body', docId: workspaceId },
      { signal: new AbortController().signal }
    );
    t.true(reservedRes.isError);
    t.regex(reservedRes.content[0].text, /Invalid document ID/);

    const dbReservedRes = await authorCreateTool.execute(
      { title: 'Bad', content: 'Body', docId: propertiesDocId },
      { signal: new AbortController().signal }
    );
    t.true(dbReservedRes.isError);
    t.regex(dbReservedRes.content[0].text, /Invalid document ID/);

    // Unauthorized user without Doc.Update rejected.
    const unauthServer = await provider.for(
      'unauthorized-user',
      workspaceId,
      McpAccessMode.READ_WRITE
    );
    const unauthCreateTool = unauthServer.tools.find(
      tool => tool.name === 'create_document'
    )!;
    const deniedRes = await unauthCreateTool.execute(
      { title: 'Hijack', content: 'Body', docId: recoveredDocId },
      { signal: new AbortController().signal }
    );
    t.true(deniedRes.isError);
    t.regex(deniedRes.content[0].text, /Doc\.Update access denied/);
  } finally {
    (globalThis as any).env = prevEnv;
  }
});

test('Copilot doc_create via executeToolCall recovers from error message hint and rejects unknown retry keys', async t => {
  const workspaceId = 'ws-copilot-recover';
  const propertiesDocId = `db$${workspaceId}$docProperties`;
  const docs = new Map<string, Uint8Array>([
    [
      workspaceId,
      createLegacyArrayRootDoc([{ id: 'existing-doc', title: 'Existing' }]),
    ],
  ]);

  // Breakpoint 2: properties succeed, root push fails.
  let failRootPush = true;
  const { writer, pushed, initialDocs } = createWriterHarness(docs, {
    async onBeforePush({ docId }) {
      if (docId === workspaceId && failRootPush) {
        throw new Error('pg_connection_lost');
      }
    },
  });

  const ac = createPermissionMock({
    denyDocUpdateUsers: new Set(['unauthorized-user']),
  });
  const handler = buildDocCreateHandler(writer, ac as any);
  const authorTools = {
    doc_create: createDocCreateTool(
      handler.bind(null, { user: 'user-1', workspace: workspaceId } as any)
    ),
  };
  const collabTools = {
    doc_create: createDocCreateTool(
      handler.bind(null, {
        user: 'collaborator-2',
        workspace: workspaceId,
      } as any)
    ),
  };

  const firstCall = await executeToolCall(
    authorTools,
    {
      callId: 'call-1',
      name: 'doc_create',
      args: {
        title: 'Copilot Recoverable',
        content: '# Copilot Recoverable\n\nBody',
      },
    },
    {} as any
  );
  const first = firstCall.output as {
    type?: string;
    code?: string;
    retryable?: boolean;
    message?: string;
    locator?: { doc_id?: string; docId?: string };
  };
  t.is(first.type, 'error');
  t.is(first.code, 'doc_create_incomplete');
  t.true(first.retryable);
  const retryMatch = /retry with (\w+)="([^"]+)"/.exec(first.message ?? '');
  t.truthy(
    retryMatch,
    'error message must include machine-parseable retry hint'
  );
  const [, retryKey, recoveredDocId] = retryMatch!;
  t.is(retryKey, 'doc_id');
  t.is(first.locator?.doc_id, recoveredDocId);
  t.is(first.locator?.docId, recoveredDocId);

  const propsPushesBeforeRecovery = pushed.filter(
    p => p.docId === propertiesDocId
  ).length;
  t.is(propsPushesBeforeRecovery, 1);

  failRootPush = false;
  for (let replay = 0; replay < 2; replay++) {
    const retryCall = await executeToolCall(
      collabTools,
      {
        callId: `call-retry-${replay}`,
        name: 'doc_create',
        args: {
          title: 'Collaborator Fallback',
          content: 'Ignored',
          [retryKey]: recoveredDocId,
        },
      },
      {} as any
    );
    t.falsy(retryCall.isError);
    const res = retryCall.output as {
      success?: boolean;
      docId?: string;
      message?: string;
    };
    t.true(res.success);
    t.is(res.docId, recoveredDocId);
    t.regex(res.message ?? '', /registration completed/);
  }

  // Body pushed once; properties NOT rewritten when already populated; root has 1 entry.
  t.is(pushed.filter(p => p.docId === recoveredDocId).length, 1);
  t.is(
    pushed.filter(p => p.docId === propertiesDocId).length,
    propsPushesBeforeRecovery,
    'must not rewrite db$docProperties when createdBy and updatedBy already exist'
  );
  t.deepEqual(readDocProperties(initialDocs, workspaceId, recoveredDocId), {
    createdBy: 'user-1',
    updatedBy: 'user-1',
  });
  const pages = extractWorkspaceLifecycleRootPages(
    Buffer.from(initialDocs.get(workspaceId)!)
  );
  t.deepEqual(
    pages.map(p => p.docId),
    ['existing-doc', recoveredDocId]
  );

  // Unknown retry field (e.g. documentId) must be rejected by .strict() without creating a second doc!
  const unknownKeyCall = await executeToolCall(
    collabTools,
    {
      callId: 'call-unknown-key',
      name: 'doc_create',
      args: {
        title: 'Duplicate Risk',
        content: 'Body',
        documentId: recoveredDocId,
      },
    },
    {} as any
  );
  t.true(unknownKeyCall.isError);
  t.deepEqual(
    [...initialDocs.keys()].filter(
      id => id !== workspaceId && !id.startsWith('db$')
    ),
    [recoveredDocId]
  );

  // Nonexistent doc_id rejected without creating any doc
  const missingCall = await executeToolCall(
    collabTools,
    {
      callId: 'call-missing',
      name: 'doc_create',
      args: { title: 'Ghost', content: 'Body', doc_id: 'does-not-exist' },
    },
    {} as any
  );
  const missing = missingCall.output as { type?: string; message?: string };
  t.is(missing.type, 'error');
  t.regex(missing.message ?? '', /not found/i);
  t.false(initialDocs.has('does-not-exist'));

  // Reserved ID rejected
  const badIdCall = await executeToolCall(
    authorTools,
    {
      callId: 'call-bad-id',
      name: 'doc_create',
      args: { title: 'Bad', content: 'Body', doc_id: propertiesDocId },
    },
    {} as any
  );
  const badId = badIdCall.output as { type?: string; message?: string };
  t.is(badId.type, 'error');
  t.regex(badId.message ?? '', /Invalid document ID/);

  // Existing doc_id without Doc.Update permission rejected
  const unauthTools = {
    doc_create: createDocCreateTool(
      handler.bind(null, {
        user: 'unauthorized-user',
        workspace: workspaceId,
      } as any)
    ),
  };
  const deniedCall = await executeToolCall(
    unauthTools,
    {
      callId: 'call-denied',
      name: 'doc_create',
      args: { title: 'Hijack', content: 'Body', doc_id: recoveredDocId },
    },
    {} as any
  );
  const denied = deniedCall.output as { type?: string; message?: string };
  t.is(denied.type, 'error');
  t.regex(denied.message ?? '', /Doc\.Update access denied/);
});

test('recoverDocCreation uses CAS on db$docProperties so interleaved updatedBy is never overwritten', async t => {
  const workspaceId = 'ws-props-cas';
  const propertiesDocId = `db$${workspaceId}$docProperties`;
  const docs = new Map<string, Uint8Array>([
    [
      workspaceId,
      createLegacyArrayRootDoc([{ id: 'existing-doc', title: 'Existing' }]),
    ],
  ]);

  let failFirstProps = true;
  let interleavedInjected = false;
  let recoveryDocId = '';
  let harness!: ReturnType<typeof createWriterHarness>;
  harness = createWriterHarness(docs, {
    async onBeforePush({ docId, expectedCurrentTimestamp }) {
      if (docId !== propertiesDocId) return;
      if (failFirstProps) {
        failFirstProps = false;
        throw new Error('pg_connection_lost');
      }
      if (!interleavedInjected && expectedCurrentTimestamp !== undefined) {
        interleavedInjected = true;
        const interleavedUpdate = updateDocProperties(
          Buffer.alloc(0),
          propertiesDocId,
          recoveryDocId,
          undefined,
          'interleaved-editor-3'
        );
        await harness.storage.pushDocUpdatesTrusted(
          workspaceId,
          propertiesDocId,
          [interleavedUpdate],
          'interleaved-editor-3'
        );
      }
    },
  });

  const err = await t.throwsAsync(
    () =>
      harness.writer.createDoc(
        workspaceId,
        'CAS Props Doc',
        '# Body',
        'user-1'
      ),
    { instanceOf: DocCreateIncompleteError }
  );
  recoveryDocId = err!.docId;

  await harness.writer.recoverDocCreation(
    workspaceId,
    recoveryDocId,
    'Fallback',
    'collaborator-2'
  );

  t.true(interleavedInjected);
  t.deepEqual(readDocProperties(docs, workspaceId, recoveryDocId), {
    createdBy: 'user-1',
    updatedBy: 'interleaved-editor-3',
  });
});

test('recoverDocCreation leaves createdBy unset for legacy doc without traceable creator record', async t => {
  const workspaceId = 'ws-legacy-no-creator';
  const legacyDocId = 'legacy-doc-1';
  const legacyDocBin = createDocWithMarkdown(
    'Legacy Doc',
    'Edited body',
    legacyDocId,
    {
      actorUserId: 'later-editor',
      timestampMs: 1000,
    }
  );
  const docs = new Map<string, Uint8Array>([
    [workspaceId, createLegacyArrayRootDoc([])],
    [legacyDocId, legacyDocBin],
  ]);

  // Simulate legacy doc with no traceable creator record (creator=undefined) and editor='later-editor'.
  const { writer } = createWriterHarness(docs, {
    initialEditors: new Map([[legacyDocId, 'later-editor']]),
  });

  await writer.recoverDocCreation(
    workspaceId,
    legacyDocId,
    'Fallback',
    'collaborator-2'
  );

  t.deepEqual(readDocProperties(docs, workspaceId, legacyDocId), {
    createdBy: undefined,
    updatedBy: 'later-editor',
  });
});

test('createDoc warns and does not fail when root doc cannot be migrated', async t => {
  const workspaceId = 'ws-corrupt-root';
  const corruptRoot = new YDoc();
  corruptRoot.getMap('meta').set('pages', 'not-an-array');
  const docs = new Map<string, Uint8Array>([
    [workspaceId, Buffer.from(encodeStateAsUpdate(corruptRoot))],
  ]);
  const { writer, initialDocs } = createWriterHarness(docs);

  const { docId } = await writer.createDoc(
    workspaceId,
    'Safe Doc',
    'hello',
    'user-1'
  );

  t.truthy(docId);
  t.truthy(initialDocs.get(docId));
});

test('updateDocMeta skips empty title update and updates root doc via native helper', async t => {
  const workspaceId = 'ws-meta-title';
  const docId = 'doc-1';
  const initialDoc = createDocWithMarkdown('Old Title', 'body', docId);
  const rootDoc = new YDoc();
  const pages = new YArray<YMap<unknown>>();
  const pageMap = new YMap<unknown>();
  pageMap.set('id', docId);
  pageMap.set('title', 'Old Title');
  pages.push([pageMap]);
  rootDoc.getMap('meta').set('pages', pages);
  const rootBin = Buffer.from(encodeStateAsUpdate(rootDoc));

  const docs = new Map<string, Uint8Array>([
    [docId, initialDoc],
    [workspaceId, rootBin],
  ]);
  const { writer, pushed, initialDocs } = createWriterHarness(docs);

  // Unchanged title should not push doc update or root update
  await writer.updateDocMeta(workspaceId, docId, { title: 'Old Title' }, 'u1');
  t.false(pushed.some(p => p.docId === docId));
  t.false(pushed.some(p => p.docId === workspaceId));

  // Changed title should push both doc and root updates
  await writer.updateDocMeta(workspaceId, docId, { title: 'New Title' }, 'u1');
  t.true(pushed.some(p => p.docId === docId));
  t.true(pushed.some(p => p.docId === workspaceId));

  const updatedRoot = new YDoc();
  applyUpdate(updatedRoot, initialDocs.get(workspaceId)!);
  const updatedPages = updatedRoot.getMap('meta').toJSON().pages as Array<{
    id: string;
    title: string;
  }>;
  t.is(updatedPages[0].title, 'New Title');
});

const docWriteHandlerCases = [
  {
    name: 'doc update',
    build: buildDocUpdateHandler,
    method: 'updateDoc',
    errorName: 'Doc Update Failed',
    arg: 'content',
  },
  {
    name: 'doc update meta',
    build: buildDocUpdateMetaHandler,
    method: 'updateDocMeta',
    errorName: 'Doc Meta Update Failed',
    arg: 'New Title',
  },
] as const;

const docWriteOutcomes = [
  {
    name: 'surfaces the writer error message',
    thrown: new Error('source_merge: ambiguous_identity'),
    expected: 'source_merge: ambiguous_identity',
  },
  {
    name: 'surfaces a non-Error thrown value',
    thrown: 'source_merge: invalid_projection',
    expected: 'source_merge: invalid_projection',
  },
  {
    name: 'reports not found for NotFoundException',
    thrown: new NotFoundException('Document doc-1 not found'),
    expected: 'Doc with id doc-1 not found.',
  },
];

for (const handlerCase of docWriteHandlerCases) {
  for (const outcome of docWriteOutcomes) {
    test(`${handlerCase.name} handler ${outcome.name}`, async t => {
      const writer = {
        async [handlerCase.method]() {
          throw outcome.thrown;
        },
      };
      const reader = {
        async resolveStorageDocId(_workspaceId: string, docId: string) {
          return docId;
        },
      };
      const handler = handlerCase.build(
        writer as any,
        createPermissionMock() as any,
        reader as any
      );

      const result: any = await handler(
        { user: 'user-1', workspace: 'ws-1' } as any,
        'doc-1',
        handlerCase.arg
      );

      t.like(result, {
        type: 'error',
        name: handlerCase.errorName,
        message: outcome.expected,
      });
    });
  }
}
