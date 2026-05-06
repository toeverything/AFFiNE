import { AiJobStatus } from '@prisma/client';
import test from 'ava';
import Sinon from 'sinon';

import { buildLegacyProjection } from '../../plugins/copilot/transcript/projection';
import { TranscriptPayloadSchema } from '../../plugins/copilot/transcript/schema';
import { CopilotTranscriptionService } from '../../plugins/copilot/transcript/service';

test('buildLegacyProjection backfills summary, actions and transcription', t => {
  const legacy = buildLegacyProjection({
    normalizedSegments: [
      {
        speaker: 'A',
        startSec: 10,
        endSec: 12,
        start: '00:00:10',
        end: '00:00:12',
        text: 'Kickoff',
      },
    ],
    summaryJson: {
      title: 'Weekly Sync',
      durationMinutes: 30,
      attendees: ['A', 'B'],
      keyPoints: ['Reviewed launch status'],
      actionItems: [
        {
          description: 'Send recap',
          owner: 'A',
          deadline: 'Friday',
        },
      ],
      decisions: ['Ship on Monday'],
      openQuestions: ['Need final QA sign-off'],
      blockers: ['Missing analytics dashboard'],
    },
  });

  t.is(legacy.title, 'Weekly Sync');
  t.true(legacy.summary?.includes('Reviewed launch status') ?? false);
  t.true(legacy.summary?.includes('## Decisions') ?? false);
  t.is(legacy.actions, '- [ ] Send recap (A · Friday)');
  t.deepEqual(legacy.transcription, [
    {
      speaker: 'A',
      start: '00:00:10',
      end: '00:00:12',
      transcription: 'Kickoff',
    },
  ]);
});

test('TranscriptPayloadSchema rejects empty payloads', t => {
  const emptyError = t.throws(() => TranscriptPayloadSchema.parse({}));
  t.truthy(emptyError);

  const unknownOnlyError = t.throws(() =>
    TranscriptPayloadSchema.parse({ foo: 'bar' })
  );
  t.truthy(unknownOnlyError);
});

function createTranscriptPromptService() {
  return {
    get: Sinon.stub().resolves({ name: 'Transcript audio structured' }),
    finish: Sinon.stub().callsFake((_prompt, params) => [
      {
        role: 'user',
        content: params.content,
      },
    ]),
  };
}

async function buildNativeTranscriptResult(input: any, runId: string) {
  await input.onRunCreated?.({ runId, attempt: 1 });
  const nativeInput = input.nativeInput;
  return {
    nativeInput,
    result: {
      sourceAudio: nativeInput.input.sourceAudio ?? null,
      quality: nativeInput.input.quality ?? null,
      infos: [{ url: 'about:invalid', mimeType: 'text/plain', index: 0 }],
      sliceManifest: null,
      normalizedSegments: [
        {
          speaker: 'A',
          startSec: 5,
          endSec: 9,
          start: '00:00:05',
          end: '00:00:09',
          text: 'Kickoff',
        },
      ],
      normalizedTranscript: '00:00:05 A: Kickoff',
      summaryJson: {
        title: 'Weekly Sync',
        durationMinutes: 1,
        attendees: ['A'],
        keyPoints: ['Kickoff'],
        actionItems: [],
        decisions: [],
        openQuestions: [],
        blockers: [],
      },
      providerMeta: { provider: 'gemini', model: 'gemini-2.5-flash' },
      version: 'transcript-result-v1',
      strategy: 'gemini',
    },
  };
}

function createSuccessfulTranscriptBridge(
  runId: string,
  bridgeInputs: unknown[]
) {
  return {
    runStream: (input: unknown) =>
      (async function* () {
        const { nativeInput, result } = await buildNativeTranscriptResult(
          input,
          runId
        );
        bridgeInputs.push({
          ...(input as Record<string, unknown>),
          nativeInput,
        });
        yield {
          type: 'action_done' as const,
          actionId: 'transcript.audio.gemini',
          actionVersion: 'v1',
          status: 'succeeded' as const,
          runId,
          result,
        };
      })(),
  };
}

test('queryTask hides ready transcript task result until settlement', async t => {
  const payload = TranscriptPayloadSchema.parse({
    infos: [
      {
        url: 'https://example.com/audio-0.m4a',
        mimeType: 'audio/m4a',
        index: 0,
      },
    ],
    normalizedTranscript: '00:00:05 A: Kickoff',
  });
  const service = new CopilotTranscriptionService(
    {
      copilotTranscriptTask: {
        getWithUser: Sinon.stub().resolves({
          id: 'task-1',
          status: 'ready',
          protectedResult: payload,
        }),
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );

  const result = await service.queryTask('user-1', 'workspace-1', 'task-1');

  t.is(result?.status, AiJobStatus.finished);
  t.deepEqual(result?.infos, payload.infos);
  t.is(result?.transcription, undefined);
});

test('settleTask unlocks ready transcript task result idempotently', async t => {
  const payload = TranscriptPayloadSchema.parse({
    normalizedTranscript: '00:00:05 A: Kickoff',
  });
  const settle = Sinon.stub().resolves({
    id: 'task-1',
    status: 'settled',
    protectedResult: payload,
  });
  const service = new CopilotTranscriptionService(
    {
      copilotTranscriptTask: {
        getWithUser: Sinon.stub().resolves({
          id: 'task-1',
          status: 'ready',
          protectedResult: payload,
        }),
        settle,
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );

  const result = await service.settleTask('user-1', 'workspace-1', 'task-1');

  t.is(result?.status, AiJobStatus.finished);
  t.is(result?.transcription?.normalizedTranscript, '00:00:05 A: Kickoff');
  Sinon.assert.calledOnceWithExactly(settle, 'task-1');
});

test('settleTask checks copilot quota before unlocking ready task', async t => {
  const payload = TranscriptPayloadSchema.parse({
    normalizedTranscript: '00:00:05 A: Kickoff',
  });
  const settle = Sinon.stub().resolves({
    id: 'task-1',
    status: 'settled',
    protectedResult: payload,
  });
  const assertQuotaOrByok = Sinon.stub().rejects(new Error('quota exceeded'));
  const service = new CopilotTranscriptionService(
    {
      copilotTranscriptTask: {
        getWithUser: Sinon.stub().resolves({
          id: 'task-1',
          status: 'ready',
          protectedResult: payload,
        }),
        settle,
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertQuotaOrByok } as never
  );

  await t.throwsAsync(
    () => service.settleTask('user-1', 'workspace-1', 'task-1'),
    { message: /quota exceeded/ }
  );
  Sinon.assert.calledOnceWithMatch(assertQuotaOrByok, {
    userId: 'user-1',
    workspaceId: 'workspace-1',
    featureKind: 'transcript',
  });
  Sinon.assert.notCalled(settle);
});

test('retryTask rejects ready transcript tasks', async t => {
  const service = new CopilotTranscriptionService(
    {
      copilotTranscriptTask: {
        getWithUser: Sinon.stub().resolves({
          id: 'task-1',
          status: 'ready',
          protectedResult: {},
        }),
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );

  await t.throwsAsync(
    () => service.retryTask('user-1', 'workspace-1', 'task-1'),
    { message: /cannot be retried/ }
  );
});

test('retryTask rejects settled transcript tasks', async t => {
  const service = new CopilotTranscriptionService(
    {
      copilotTranscriptTask: {
        getWithUser: Sinon.stub().resolves({
          id: 'task-1',
          status: 'settled',
          protectedResult: {},
        }),
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );

  await t.throwsAsync(
    () => service.retryTask('user-1', 'workspace-1', 'task-1'),
    { message: /cannot be retried/ }
  );
});

test('retryTask reuses failed task and queues a new action attempt', async t => {
  const queuedJobs: unknown[] = [];
  const markRunning = Sinon.stub().resolves({
    id: 'task-1',
    status: 'running',
  });
  const payload = TranscriptPayloadSchema.parse({
    normalizedTranscript: '00:00:05 A: Kickoff',
    summaryJson: null,
    providerMeta: { provider: 'gemini', model: 'gemini-2.5-flash' },
  });
  const service = new CopilotTranscriptionService(
    {
      copilotTranscriptTask: {
        getWithUser: Sinon.stub().resolves({
          id: 'task-1',
          status: 'failed',
          strategy: 'gemini',
          actionRunId: 'run-failed',
          protectedResult: payload,
        }),
        markRunning,
      },
    } as never,
    {
      add: Sinon.stub().callsFake(async (name, payload) => {
        queuedJobs.push({ name, payload });
      }),
    } as never,
    {} as never,
    {
      resolveTranscriptionModel: Sinon.stub().resolves('gemini-2.5-flash'),
    } as never,
    {} as never,
    {} as never
  );

  const result = await service.retryTask('user-1', 'workspace-1', 'task-1');

  t.is(result.status, AiJobStatus.running);
  t.like(queuedJobs[0] as Record<string, unknown>, {
    name: 'copilot.transcript.task.submit',
  });
  t.like((queuedJobs[0] as { payload: Record<string, unknown> }).payload, {
    taskId: 'task-1',
    retryOf: 'run-failed',
  });
  Sinon.assert.calledOnceWithExactly(markRunning, 'task-1');
});

test('retryTask prechecks quota or BYOK before queueing provider work', async t => {
  const add = Sinon.stub().resolves(undefined);
  const markRunning = Sinon.stub().resolves({ id: 'task-1' });
  const assertQuotaOrByok = Sinon.stub().rejects(new Error('quota exceeded'));
  const payload = TranscriptPayloadSchema.parse({
    normalizedTranscript: '00:00:05 A: Kickoff',
  });
  const service = new CopilotTranscriptionService(
    {
      copilotTranscriptTask: {
        getWithUser: Sinon.stub().resolves({
          id: 'task-1',
          status: 'failed',
          strategy: 'gemini',
          protectedResult: payload,
        }),
        markRunning,
      },
    } as never,
    { add } as never,
    {} as never,
    {
      resolveTranscriptionModel: Sinon.stub().resolves('gemini-2.5-flash'),
    } as never,
    {} as never,
    {} as never,
    { assertQuotaOrByok } as never
  );

  await t.throwsAsync(
    () => service.retryTask('user-1', 'workspace-1', 'task-1'),
    { message: /quota exceeded/ }
  );
  Sinon.assert.calledOnceWithMatch(assertQuotaOrByok, {
    userId: 'user-1',
    workspaceId: 'workspace-1',
    featureKind: 'transcript',
  });
  Sinon.assert.notCalled(add);
  Sinon.assert.notCalled(markRunning);
});

for (const status of ['ready', 'settled']) {
  test(`submitTask allows a new task for the same blob after ${status} task`, async t => {
    const createdTasks: unknown[] = [];
    const queuedJobs: unknown[] = [];
    const service = new CopilotTranscriptionService(
      {
        copilotTranscriptTask: {
          getWithUser: Sinon.stub().resolves({
            id: `task-${status}`,
            status,
          }),
          create: Sinon.stub().callsFake(async input => {
            createdTasks.push(input);
            return { id: 'task-next' };
          }),
          markRunning: Sinon.stub().resolves({ id: 'task-next' }),
        },
      } as never,
      {
        add: Sinon.stub().callsFake(async (name, payload) => {
          queuedJobs.push({ name, payload });
        }),
      } as never,
      {} as never,
      {
        resolveTranscriptionModel: Sinon.stub().resolves('gemini-2.5-flash'),
      } as never,
      {} as never,
      {} as never
    );

    const result = await service.submitTask(
      'user-1',
      'workspace-1',
      'blob-1',
      []
    );

    t.is(result.id, 'task-next');
    t.like(createdTasks[0] as Record<string, unknown>, {
      blobId: 'blob-1',
      recipeId: 'transcript.audio.gemini',
    });
    t.like(queuedJobs[0] as Record<string, unknown>, {
      name: 'copilot.transcript.task.submit',
    });
  });
}

test('submitTask prechecks quota or BYOK before persisting uploads', async t => {
  const assertQuotaOrByok = Sinon.stub().rejects(new Error('quota exceeded'));
  const resolveTranscriptionModel = Sinon.stub().resolves('gemini-2.5-flash');
  const service = new CopilotTranscriptionService(
    {
      copilotTranscriptTask: {
        getWithUser: Sinon.stub().resolves(null),
      },
    } as never,
    {} as never,
    {} as never,
    {
      resolveTranscriptionModel,
    } as never,
    {} as never,
    {} as never,
    { assertQuotaOrByok } as never
  );

  await t.throwsAsync(
    () => service.submitTask('user-1', 'workspace-1', 'blob-1', []),
    { message: /quota exceeded/ }
  );
  Sinon.assert.calledOnceWithMatch(assertQuotaOrByok, {
    userId: 'user-1',
    workspaceId: 'workspace-1',
    featureKind: 'transcript',
  });
  Sinon.assert.notCalled(resolveTranscriptionModel);
});

test('submitTask rejects unavailable transcript strategy', async t => {
  const service = new CopilotTranscriptionService(
    {
      copilotTranscriptTask: {
        getWithUser: Sinon.stub().resolves(null),
      },
    } as never,
    {} as never,
    {} as never,
    {
      resolveTranscriptionModel: Sinon.stub().resolves('gemini-2.5-flash'),
    } as never,
    {} as never,
    {} as never
  );

  await t.throwsAsync(
    () =>
      service.submitTask('user-1', 'workspace-1', 'blob-1', [], {
        strategy: 'local-asr',
      }),
    { message: /not available/ }
  );
});

test('transcriptTask runs native transcript recipe through action bridge when available', async t => {
  const payload = TranscriptPayloadSchema.parse({
    sourceAudio: { blobId: 'blob-1', mimeType: 'audio/opus' },
    sliceManifest: [
      {
        index: 0,
        fileName: 'audio-0.opus',
        mimeType: 'audio/opus',
        startSec: 12,
        durationSec: 30,
      },
    ],
    infos: [
      {
        url: 'data:image/png;base64,YXVkaW8=',
        mimeType: 'audio/opus',
        index: 0,
      },
    ],
  });
  const bridgeInputs: unknown[] = [];
  const markRunning = Sinon.stub().resolves({ id: 'task-1' });
  const complete = Sinon.stub().resolves({ id: 'task-1', status: 'ready' });
  const service = new CopilotTranscriptionService(
    {
      copilotTranscriptTask: {
        get: Sinon.stub().resolves({
          id: 'task-1',
          userId: 'user-1',
          workspaceId: 'workspace-1',
          blobId: 'blob-1',
          status: 'pending',
          actionRunId: null,
        }),
        markRunning,
        complete,
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    createTranscriptPromptService() as never,
    createSuccessfulTranscriptBridge('run-bridge', bridgeInputs) as never
  );

  await service.transcriptTask({
    taskId: 'task-1',
    payload,
    modelId: 'gemini-2.5-flash',
  });

  t.like(bridgeInputs[0] as Record<string, unknown>, {
    actionId: 'transcript.audio.gemini',
    actionVersion: 'v1',
  });
  t.like(
    (bridgeInputs[0] as { prepareStructuredRoutes: Record<string, unknown> })
      .prepareStructuredRoutes,
    {
      stepId: 'transcribe',
      modelId: 'gemini-2.5-flash',
    }
  );
  const messages = (
    bridgeInputs[0] as {
      prepareStructuredRoutes: {
        messages: { content?: string; attachments?: unknown[] }[];
      };
    }
  ).prepareStructuredRoutes.messages;
  t.false(messages[0].content?.includes('data:image/png'));
  t.like(JSON.parse(messages[0].content ?? '{}'), {
    infos: [{ mimeType: 'audio/opus', index: 0 }],
  });
  t.deepEqual(messages.at(-1)?.attachments, [
    { attachment: 'data:image/png;base64,YXVkaW8=', mimeType: 'audio/opus' },
  ]);
  t.like(complete.firstCall.args[1], {
    status: 'ready',
    actionRunId: 'run-bridge',
    errorCode: null,
  });
  Sinon.assert.calledWith(markRunning, 'task-1', 'run-bridge');
  t.is(
    complete.firstCall.args[1].protectedResult.normalizedTranscript,
    '00:00:05 A: Kickoff'
  );
});

test('transcriptTask fails task when native action bridge reports an error event', async t => {
  const payload = TranscriptPayloadSchema.parse({
    normalizedTranscript: '00:00:05 A: Kickoff',
  });
  const complete = Sinon.stub().resolves({ id: 'task-1', status: 'failed' });
  const service = new CopilotTranscriptionService(
    {
      copilotTranscriptTask: {
        get: Sinon.stub().resolves({
          id: 'task-1',
          userId: 'user-1',
          workspaceId: 'workspace-1',
          blobId: 'blob-1',
          status: 'pending',
          actionRunId: null,
        }),
        markRunning: Sinon.stub().resolves({ id: 'task-1' }),
        complete,
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    createTranscriptPromptService() as never,
    {
      runStream: (input: unknown) =>
        (async function* () {
          await buildNativeTranscriptResult(input, 'run-bridge');
          yield {
            type: 'error' as const,
            actionId: 'transcript.audio.gemini',
            actionVersion: 'v1',
            status: 'failed' as const,
            runId: 'run-bridge',
            errorCode: 'native_failed',
          };
        })(),
    } as never
  );

  await t.throwsAsync(
    () =>
      service.transcriptTask({
        taskId: 'task-1',
        payload,
        modelId: 'gemini-2.5-flash',
      }),
    { message: /native_failed/ }
  );
  t.like(complete.firstCall.args[1], {
    status: 'failed',
    actionRunId: 'run-bridge',
  });
});
