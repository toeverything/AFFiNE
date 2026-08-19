import { randomUUID } from 'node:crypto';

import type { TestFn } from 'ava';
import ava from 'ava';

import { Models } from '../../models';
import { CapabilityRuntime } from '../../plugins/copilot/runtime/capability-runtime';
import { CopilotTranscriptionService } from '../../plugins/copilot/transcript';
import { TranscriptPayloadSchema } from '../../plugins/copilot/transcript/schema';
import { createTestingApp, createWorkspace, type TestingApp } from '../utils';
import {
  chatWithActionStream,
  chatWithImages,
  chatWithStreamObject,
  chatWithText,
  createCopilotMessage,
  createCopilotSession,
  sse2array,
} from '../utils/copilot';

type Context = {
  app: TestingApp;
  models: Models;
  runtime: CapabilityRuntime;
  transcript: CopilotTranscriptionService;
};

const test = ava.serial as TestFn<Context>;
const providerTest =
  process.env.AFFINE_TEST_COPILOT_PROVIDER === 'true' ? test : test.skip;

test.before(async t => {
  const app = await createTestingApp();
  t.context = {
    app,
    models: app.get(Models),
    runtime: app.get(CapabilityRuntime),
    transcript: app.get(CopilotTranscriptionService),
  };
});

test.beforeEach(async t => {
  await t.context.app.initTestingDB();
});

test.after.always(async t => {
  await t.context.app?.close();
});

async function assertManagedRoute(
  runtime: CapabilityRuntime,
  slot: string,
  builtInRouteId?: string
) {
  await runtime.assertRoute(
    slot,
    {},
    {
      builtInRouteId,
      quotaBackedRoutesAllowed: true,
    }
  );
}

providerTest(
  'managed text and object routes satisfy the public SSE contract',
  async t => {
    const { app, runtime } = t.context;
    await assertManagedRoute(runtime, 'chat.default', 'Chat With AFFiNE AI');
    await app.signupV1();
    const workspace = await createWorkspace(app);

    const textSession = await createCopilotSession(
      app,
      workspace.id,
      randomUUID(),
      'Chat With AFFiNE AI'
    );
    const textToken = await createCopilotMessage(
      app,
      textSession,
      'Explain AFFiNE in one sentence.'
    );
    t.truthy((await chatWithText(app, textSession, textToken)).trim());

    const objectSession = await createCopilotSession(
      app,
      workspace.id,
      randomUUID(),
      'Chat With AFFiNE AI'
    );
    const objectToken = await createCopilotMessage(
      app,
      objectSession,
      'Explain AFFiNE in one sentence.'
    );
    const events = sse2array(
      await chatWithStreamObject(app, objectSession, objectToken)
    );
    t.false(events.some(event => event.event === 'error'));
    t.true(events.some(event => event.event === 'message'));
  }
);

providerTest(
  'managed embedding and rerank routes expose final result shapes',
  async t => {
    const { app, runtime } = t.context;
    await assertManagedRoute(runtime, 'index.embedding');
    await assertManagedRoute(runtime, 'search.rerank');
    const user = await app.signupV1();
    const workspace = await createWorkspace(app);
    const options = { user: user.id, workspace: workspace.id };

    const embeddings = await runtime.embed('route-selected', ['AFFiNE'], {
      ...options,
      featureKind: 'embedding',
    });
    t.is(embeddings.length, 1);
    t.true(embeddings[0].length > 0);

    const scores = await runtime.rerank(
      'route-selected',
      {
        query: 'collaborative editor',
        candidates: [
          { id: 'relevant', text: 'AFFiNE is a collaborative editor.' },
          { id: 'irrelevant', text: 'A recipe for apple pie.' },
        ],
      },
      { ...options, featureKind: 'rerank' }
    );
    t.is(scores.length, 2);
    t.true(scores.every(score => Number.isFinite(score)));
  }
);

providerTest(
  'managed image and action routes preserve public event contracts',
  async t => {
    const { app, runtime } = t.context;
    await assertManagedRoute(runtime, 'image.generate', 'Generate image');
    await assertManagedRoute(
      runtime,
      'action.mindmap.generate',
      'mindmap.generate'
    );
    await app.signupV1();
    const workspace = await createWorkspace(app);

    const imageSession = await createCopilotSession(
      app,
      workspace.id,
      randomUUID(),
      'Generate image'
    );
    const imageToken = await createCopilotMessage(
      app,
      imageSession,
      'A simple panda icon.'
    );
    const imageEvents = sse2array(
      await chatWithImages(app, imageSession, imageToken)
    );
    t.false(imageEvents.some(event => event.event === 'error'));
    t.true(imageEvents.some(event => event.event === 'attachment'));

    const actionSession = await createCopilotSession(
      app,
      workspace.id,
      randomUUID(),
      'mindmap.generate'
    );
    const actionToken = await createCopilotMessage(
      app,
      actionSession,
      'AFFiNE product architecture'
    );
    const actionEvents = sse2array(
      await chatWithActionStream(app, actionSession, {
        actionId: 'mindmap.generate',
        messageId: actionToken,
      })
    );
    t.false(actionEvents.some(event => event.event === 'error'));
    t.true(
      actionEvents.some(
        event =>
          event.event === 'message' || event.data?.includes('action_done')
      )
    );
  }
);

providerTest(
  'managed transcript route executes the provider-neutral job port',
  async t => {
    const { models, runtime, transcript } = t.context;
    await assertManagedRoute(runtime, 'transcript.audio', 'Transcript audio');
    const user = await models.user.create({
      email: `copilot-provider-transcript-${randomUUID()}@affine.pro`,
    });
    const workspace = await models.workspace.create(user.id);
    const blobId = `copilot-provider-transcript-${randomUUID()}`;
    const payload = TranscriptPayloadSchema.parse({
      sourceAudio: { blobId, mimeType: 'audio/mpeg' },
      infos: [
        {
          url: 'https://cdn.affine.pro/copilot-test/MP9qDGuYgnY+ILoEAmHpp3h9Npuw2403EAYMEA.mp3',
          mimeType: 'audio/mpeg',
          index: 0,
        },
      ],
    });
    const task = await models.copilotTranscriptTask.create({
      userId: user.id,
      workspaceId: workspace.id,
      blobId,
      recipeId: 'transcript.audio',
      recipeVersion: 'v1',
      dispatchGeneration: 'provider-test-generation',
      inputSnapshot: payload,
      publicMeta: { sourceAudio: payload.sourceAudio, infos: payload.infos },
    });

    await transcript.transcriptTask({
      taskId: task.id,
      payload,
      generation: 'provider-test-generation',
    });
    const ready = await models.copilotTranscriptTask.get(task.id);
    t.is(ready?.status, 'ready');
    t.is(
      typeof TranscriptPayloadSchema.parse(ready?.protectedResult)
        .normalizedTranscript,
      'string'
    );
  }
);
