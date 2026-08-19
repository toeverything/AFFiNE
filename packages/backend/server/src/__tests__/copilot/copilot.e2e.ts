import '../../plugins/copilot';

import { randomUUID } from 'node:crypto';

import { createCopilotMessageMutation } from '@affine/graphql';
import { McpAccessMode, PrismaClient } from '@prisma/client';
import type { TestFn } from 'ava';
import ava from 'ava';

import { Config } from '../../base';
import { ServerFeature, ServerService } from '../../core';
import { AuthService } from '../../core/auth';
import { Models } from '../../models';
import { CopilotFeatureService } from '../../plugins/copilot/feature';
import { McpCredentialService } from '../../plugins/copilot/mcp/credential';
import { WorkspaceMcpProvider } from '../../plugins/copilot/mcp/provider';
import { installMockCopilotRuntime } from '../mocks';
import { createTestingApp, createWorkspace, type TestingApp } from '../utils';
import {
  chatWithImages,
  chatWithText,
  createCopilotMessage,
  createCopilotSession,
  getCopilotSession,
  getHistories,
  sse2array,
} from '../utils/copilot';

type Context = {
  app: TestingApp;
  restoreRuntime: () => void;
};

const test = ava.serial as TestFn<Context>;

test.before(async t => {
  const restoreRuntime = installMockCopilotRuntime();
  t.context = {
    app: await createTestingApp(),
    restoreRuntime,
  };
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
});

test.after.always(async t => {
  t.context.restoreRuntime?.();
  await t.context.app?.close();
});

test('disabled copilot hides its server feature and rejects every API transport', async t => {
  const { app } = t.context;
  const config = app.get(Config);
  const feature = app.get(CopilotFeatureService);
  const server = app.get(ServerService);
  await app.signupV1();
  const workspace = await createWorkspace(app);

  config.copilot.enabled = false;
  feature.onConfigChanged({ updates: { copilot: { enabled: false } } });
  try {
    t.false(server.features.includes(ServerFeature.Copilot));
    await t.throwsAsync(
      createCopilotSession(
        app,
        workspace.id,
        randomUUID(),
        'Chat With AFFiNE AI'
      )
    );
    await app.GET('/api/copilot/unsplash/photos').expect(403);
    await app
      .POST(`/api/workspaces/${workspace.id}/mcp`)
      .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
      .expect(403);
  } finally {
    config.copilot.enabled = true;
    feature.onConfigChanged({ updates: { copilot: { enabled: true } } });
  }
});

test('session, message, local context restriction and durable history share one public contract', async t => {
  const { app } = t.context;
  await app.signupV1();
  const workspace = await createWorkspace(app);
  const docId = randomUUID();
  const sessionId = await createCopilotSession(
    app,
    workspace.id,
    docId,
    'Chat With AFFiNE AI'
  );

  t.deepEqual(await getCopilotSession(app, workspace.id, sessionId), {
    id: sessionId,
    docId,
    parentSessionId: null,
    pinned: false,
    promptName: 'Chat With AFFiNE AI',
  });

  const token = await createCopilotMessage(app, sessionId, 'hello');
  const [beforeStream] = await getHistories(app, {
    workspaceId: workspace.id,
    docId,
  });
  t.is(beforeStream.sessionId, sessionId);
  t.deepEqual(beforeStream.messages, []);

  t.is(
    await chatWithText(app, sessionId, token),
    'generate text to text stream'
  );
  t.is(
    await chatWithText(app, sessionId, token),
    'generate text to text stream'
  );
  const [history] = await getHistories(app, {
    workspaceId: workspace.id,
    docId,
  });
  t.deepEqual(
    history.messages.map(message => [message.role, message.content]),
    [
      ['user', 'hello'],
      ['assistant', 'generate text to text stream'],
      ['assistant', 'generate text to text stream'],
    ]
  );
  t.is(history.messages.filter(message => message.role === 'user').length, 1);
  t.not(history.messages[0].id, token);

  const localSessionId = await createCopilotSession(
    app,
    randomUUID(),
    null,
    'Chat With AFFiNE AI'
  );
  t.truthy(await createCopilotMessage(app, localSessionId, 'local hello'));
  const localContextResponse = await app
    .POST('/graphql')
    .set('x-operation-name', createCopilotMessageMutation.op)
    .send({
      query: createCopilotMessageMutation.query,
      variables: {
        options: {
          sessionId: localSessionId,
          content: 'local context',
          params: {
            scopeSelectors: [{ kind: 'document', id: randomUUID() }],
          },
        },
      },
    })
    .expect(200);
  t.is(
    localContextResponse.body.errors?.[0]?.message,
    "Local workspaces don't support attachments or references."
  );
  await t.throwsAsync(
    app.gql({
      query: createCopilotMessageMutation,
      variables: {
        options: {
          sessionId: localSessionId,
          content: 'local attachment',
          blobs: [new File(['attachment'], 'attachment.txt')],
        },
      },
    }),
    {
      message: "Local workspaces don't support attachments or references.",
    }
  );
});

test('chat and history endpoints reject a different user', async t => {
  const { app } = t.context;
  const owner = await app.signupV1();
  const workspace = await createWorkspace(app);
  const sessionId = await createCopilotSession(
    app,
    workspace.id,
    randomUUID(),
    'Chat With AFFiNE AI'
  );
  const token = await createCopilotMessage(app, sessionId, 'private');
  await app.signupV1();

  await t.throwsAsync(chatWithText(app, sessionId, token));
  await t.throwsAsync(getHistories(app, { workspaceId: workspace.id }));

  await app.switchUser(owner);
  t.is(
    await chatWithText(app, sessionId, token),
    'generate text to text stream'
  );
});

test('image SSE emits persisted attachment events for action sessions', async t => {
  const { app } = t.context;
  await app.signupV1();
  const workspace = await createWorkspace(app);
  const sessionId = await createCopilotSession(
    app,
    workspace.id,
    randomUUID(),
    'Generate image'
  );
  const token = await createCopilotMessage(app, sessionId, 'Panda');

  const events = sse2array(await chatWithImages(app, sessionId, token));
  const attachment = events.find(event => event.event === 'attachment');
  t.truthy(attachment?.data);
});

test('MCP credentials remain endpoint-bound through rotate, revoke and expiry', async t => {
  const { app } = t.context;
  const auth = app.get(AuthService);
  const credentials = app.get(McpCredentialService);
  const db = app.get(PrismaClient);
  const models = app.get(Models);
  const provider = app.get(WorkspaceMcpProvider);
  const user = await auth.signUp(`mcp-${randomUUID()}@affine.pro`, '123456');
  const target = await models.workspace.create(user.id);
  const other = await models.workspace.create(user.id);
  const issued = await credentials.create({
    userId: user.id,
    workspaceId: target.id,
    name: 'Claude Desktop',
    accessMode: McpAccessMode.READ_ONLY,
    expirationDays: 90,
  });

  t.like(await credentials.authenticate(issued.token, target.id), {
    userId: user.id,
    workspaceId: target.id,
    accessMode: McpAccessMode.READ_ONLY,
  });
  await t.throwsAsync(credentials.authenticate(issued.token, other.id));
  const response = await app
    .POST(`/api/workspaces/${target.id}/mcp`)
    .set('Authorization', `Bearer ${issued.token}`)
    .send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
    .expect(200);
  t.like(response.body, { jsonrpc: '2.0', id: 1 });
  t.deepEqual(
    (await provider.for(user.id, target.id, McpAccessMode.READ_ONLY)).tools.map(
      tool => tool.name
    ),
    ['read_document', 'doc_search']
  );

  const rotated = await credentials.rotate(
    issued.credential.id,
    user.id,
    target.id,
    30
  );
  t.like((await credentials.list(user.id, target.id))[0], {
    status: 'ROTATING',
  });
  await credentials.authenticate(issued.token, target.id);
  await credentials.revoke(rotated.credential.id, user.id, target.id);
  await t.throwsAsync(credentials.authenticate(issued.token, target.id));
  await t.throwsAsync(credentials.authenticate(rotated.token, target.id));

  const disabled = await credentials.create({
    userId: user.id,
    workspaceId: target.id,
    name: 'Disabled user',
    accessMode: McpAccessMode.READ_ONLY,
    expirationDays: 30,
  });
  await models.user.update(user.id, { disabled: true });
  await t.throwsAsync(credentials.authenticate(disabled.token, target.id));
  await models.user.update(user.id, { disabled: false });
  await db.mcpCredential.update({
    where: { id: disabled.credential.id },
    data: { expiresAt: new Date(0) },
  });
  await t.throwsAsync(credentials.authenticate(disabled.token, target.id));
});
