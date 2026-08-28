import { AiJobStatus } from '@prisma/client';
import test from 'ava';
import Sinon from 'sinon';

import { buildLegacyProjection } from '../../plugins/copilot/transcript/projection';
import { CopilotTranscriptionRetryService } from '../../plugins/copilot/transcript/retry';
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
    get: Sinon.stub().callsFake(async name => ({ name })),
    finish: Sinon.stub().callsFake((_prompt, params) => [
      {
        role: 'user',
        content: params.content,
      },
    ]),
  };
}

function createSuccessfulTranscriptBridge(
  runId: string,
  bridgeInputs: unknown[]
) {
  return {
    runStream: (input: any, executor: (input: any) => Promise<any>) =>
      (async function* () {
        await input.onRunCreated?.({ runId, attempt: 1 });
        const { result } = await executor(input);
        bridgeInputs.push(input);
        yield {
          type: 'action_done' as const,
          actionId: 'transcript.audio',
          actionVersion: 'v1',
          status: 'succeeded' as const,
          runId,
          result,
        };
      })(),
  };
}

function createCopilotTranscriptionService(...deps: unknown[]) {
  const retry = new CopilotTranscriptionRetryService(
    deps[0] as never,
    deps[1] as never,
    (deps[6] ?? { assertRoute: Sinon.stub().resolves() }) as never,
    (deps[7] ?? { publish: Sinon.stub() }) as never
  );
  return new CopilotTranscriptionService(
    deps[0] as never,
    deps[2] as never,
    deps[4] as never,
    deps[5] as never,
    (deps[6] ?? { assertRoute: Sinon.stub().resolves() }) as never,
    (deps[7] ?? { publish: Sinon.stub() }) as never,
    retry
  );
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
  const service = createCopilotTranscriptionService(
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
  const service = createCopilotTranscriptionService(
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

test('retryTask rejects ready transcript tasks', async t => {
  const service = createCopilotTranscriptionService(
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
  const service = createCopilotTranscriptionService(
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
  const assertRoute = Sinon.stub().resolves();
  const claimRetry = Sinon.stub();
  claimRetry.onFirstCall().resolves(true);
  claimRetry.onSecondCall().resolves(false);
  const payload = TranscriptPayloadSchema.parse({
    normalizedTranscript: '00:00:05 A: Kickoff',
    summaryJson: null,
  });
  const service = createCopilotTranscriptionService(
    {
      copilotTranscriptTask: {
        getWithUser: Sinon.stub().resolves({
          id: 'task-1',
          status: 'failed',
          actionRunId: 'run-failed',
          protectedResult: payload,
        }),
        claimRetry,
      },
    } as never,
    {
      add: Sinon.stub().callsFake(async (name, payload, options) => {
        queuedJobs.push({ name, payload, options });
      }),
    } as never,
    {} as never,
    {
      resolveTranscriptionModel: Sinon.stub().resolves('gemini-3.7-flash'),
    } as never,
    {} as never,
    {} as never,
    { assertRoute } as never
  );

  const result = await service.retryTask('user-1', 'workspace-1', 'task-1');

  t.is(result?.status, AiJobStatus.pending);
  t.like(queuedJobs[0] as Record<string, unknown>, {
    name: 'copilot.transcript.task.submit',
  });
  t.like((queuedJobs[0] as { payload: Record<string, unknown> }).payload, {
    taskId: 'task-1',
    retryOf: 'run-failed',
  });
  t.like((queuedJobs[0] as { options: Record<string, unknown> }).options, {
    attempts: 1,
    removeOnFail: true,
  });
  await t.throwsAsync(
    () => service.retryTask('user-1', 'workspace-1', 'task-1'),
    { message: /Only failed transcript tasks/ }
  );
  t.is(queuedJobs.length, 1);
  Sinon.assert.alwaysCalledWithExactly(
    assertRoute,
    'transcript.audio',
    {},
    {
      user: 'user-1',
      workspace: 'workspace-1',
      featureKind: 'transcript',
      builtInRouteId: 'Transcript audio',
    }
  );
  t.is(assertRoute.callCount, 2);

  const failPendingDispatch = Sinon.stub().resolves(true);
  const failingRetry = new CopilotTranscriptionRetryService(
    {
      copilotTranscriptTask: {
        getWithUser: Sinon.stub().resolves({
          id: 'task-2',
          status: 'failed',
          actionRunId: null,
          protectedResult: payload,
        }),
        claimRetry: Sinon.stub().resolves(true),
        failPendingDispatch,
      },
    } as never,
    { add: Sinon.stub().rejects(new Error('redis unavailable')) } as never,
    { assertRoute: Sinon.stub().resolves() } as never,
    { publish: Sinon.stub() } as never
  );
  await t.throwsAsync(
    () => failingRetry.retryTask('user-1', 'workspace-1', 'task-2'),
    { message: 'redis unavailable' }
  );
  Sinon.assert.calledOnceWithExactly(
    failPendingDispatch,
    'task-2',
    Sinon.match.string,
    'redis unavailable'
  );

  const recoveredJobs: unknown[] = [];
  const recovery = new CopilotTranscriptionRetryService(
    {
      copilotTranscriptTask: {
        pendingDispatches: Sinon.stub().resolves([
          {
            id: 'task-3',
            workspaceId: 'workspace-1',
            dispatchGeneration: 'generation-recovery',
            actionRunId: 'run-failed',
            protectedResult: payload,
            inputSnapshot: null,
          },
        ]),
        staleRunningDispatches: Sinon.stub().resolves([]),
      },
    } as never,
    {
      add: Sinon.stub().callsFake(async (name, jobPayload, options) => {
        recoveredJobs.push({ name, jobPayload, options });
      }),
    } as never,
    {} as never,
    { publish: Sinon.stub() } as never
  );
  await recovery.reconcileDispatches();
  t.like(recoveredJobs[0] as Record<string, unknown>, {
    name: 'copilot.transcript.task.submit',
  });
  t.like((recoveredJobs[0] as { options: Record<string, unknown> }).options, {
    jobId: 'copilot-transcript-task/task-3/generation-recovery',
    attempts: 1,
  });
});

for (const status of ['ready', 'settled']) {
  test(`submitTask allows a new task for the same blob after ${status} task`, async t => {
    const createdTasks: unknown[] = [];
    const queuedJobs: unknown[] = [];
    const assertRoute = Sinon.stub().resolves();
    const service = createCopilotTranscriptionService(
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
        add: Sinon.stub().callsFake(async (name, payload, options) => {
          queuedJobs.push({ name, payload, options });
        }),
      } as never,
      {} as never,
      {
        resolveTranscriptionModel: Sinon.stub().resolves('gemini-3.7-flash'),
      } as never,
      {} as never,
      {} as never,
      { assertRoute } as never
    );

    const result = await service.submitTask(
      'user-1',
      'workspace-1',
      'blob-1',
      []
    );

    t.is(result.id, 'task-next');
    t.is(result.status, AiJobStatus.pending);
    t.like(createdTasks[0] as Record<string, unknown>, {
      blobId: 'blob-1',
      recipeId: 'transcript.audio',
    });
    t.is(
      typeof (createdTasks[0] as Record<string, unknown>).dispatchGeneration,
      'string'
    );
    t.like(queuedJobs[0] as Record<string, unknown>, {
      name: 'copilot.transcript.task.submit',
    });
    t.like((queuedJobs[0] as { options: Record<string, unknown> }).options, {
      attempts: 1,
      removeOnFail: true,
    });
    Sinon.assert.calledOnceWithExactly(
      assertRoute,
      'transcript.audio',
      {},
      {
        user: 'user-1',
        workspace: 'workspace-1',
        featureKind: 'transcript',
        builtInRouteId: 'Transcript audio',
      }
    );
  });
}

test('transcriptTask transcribes each audio slice and merges absolute timestamps', async t => {
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
      {
        index: 1,
        fileName: 'audio-1.opus',
        mimeType: 'audio/opus',
        startSec: 42,
        durationSec: 300,
      },
    ],
    infos: [
      {
        key: 'blob-1-0',
        url: 'https://affine.fail/api/copilot/blob/user-1/workspace-1/blob-1-0',
        mimeType: 'audio/opus',
        index: 0,
      },
      {
        key: 'blob-1-1',
        url: 'https://affine.fail/api/copilot/blob/user-1/workspace-1/blob-1-1',
        mimeType: 'audio/opus',
        index: 1,
      },
    ],
  });
  const bridgeInputs: unknown[] = [];
  const clock = Sinon.useFakeTimers();
  t.teardown(() => clock.restore());
  const structuredCalls: {
    messages: { content?: string; attachments?: unknown[] }[];
    options: { builtInRouteId?: string };
    slot?: string;
  }[] = [];
  let transientFailure = true;
  const generateStructuredValue = Sinon.stub().callsFake(
    async (
      _conditions: unknown,
      messages: { content?: string; attachments?: unknown[] }[],
      options: { builtInRouteId?: string },
      _contract: unknown,
      _filter: unknown,
      slot?: string
    ) => {
      structuredCalls.push({ messages, options, slot });
      if (options.builtInRouteId === 'Summarize the meeting structured') {
        return {
          value: {
            title: 'Weekly Sync',
            durationMinutes: 1,
            attendees: ['A', 'B'],
            keyPoints: ['Kickoff', 'Follow-up'],
            actionItems: [],
            decisions: [],
            openQuestions: [],
            blockers: [],
          },
        };
      }

      const attachment = messages
        .flatMap(message => message.attachments ?? [])
        .at(0) as { attachment: string };
      if (attachment.attachment.includes('blob-1-1') && transientFailure) {
        transientFailure = false;
        throw new Error('upstream returned status 503: UNAVAILABLE');
      }
      return {
        value: attachment.attachment.includes('blob-1-0')
          ? [{ a: 'A', s: 5, e: 9, t: 'Kickoff' }]
          : [{ a: 'B', s: 100, e: 500, t: 'Follow-up' }],
      };
    }
  );
  const claimDispatch = Sinon.stub();
  claimDispatch.onFirstCall().resolves(true);
  claimDispatch.onSecondCall().resolves(false);
  const attachActionRun = Sinon.stub().resolves(true);
  const completeDispatch = Sinon.stub().resolves(true);
  const service = createCopilotTranscriptionService(
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
        claimDispatch,
        attachActionRun,
        completeDispatch,
      },
    } as never,
    {} as never,
    {
      presignGet: Sinon.stub().callsFake(
        async (_userId, _workspaceId, key) =>
          `https://canary.copilotcontent.affine.pro/${key}?sig=test`
      ),
    } as never,
    {} as never,
    createTranscriptPromptService() as never,
    createSuccessfulTranscriptBridge('run-bridge', bridgeInputs) as never,
    { generateStructuredValue } as never
  );

  const run = service.transcriptTask({
    taskId: 'task-1',
    payload,
    generation: 'generation-1',
  });
  await clock.tickAsync(5_000);
  await run;
  await service.transcriptTask({
    taskId: 'task-1',
    payload,
    generation: 'generation-1',
  });
  t.is(bridgeInputs.length, 1);

  t.like(bridgeInputs[0] as Record<string, unknown>, {
    actionId: 'transcript.audio',
    actionVersion: 'v1',
  });
  t.like((bridgeInputs[0] as { step: Record<string, unknown> }).step, {
    slot: 'transcript.audio',
    builtInRouteId: 'Transcript audio',
  });
  t.deepEqual(
    (
      bridgeInputs[0] as {
        inputSnapshot: { infos: unknown[] };
      }
    ).inputSnapshot.infos,
    [
      {
        url: 'https://canary.copilotcontent.affine.pro/blob-1-0?sig=test',
        mimeType: 'audio/opus',
        index: 0,
      },
      {
        url: 'https://canary.copilotcontent.affine.pro/blob-1-1?sig=test',
        mimeType: 'audio/opus',
        index: 1,
      },
    ]
  );
  t.is(structuredCalls.length, 4);
  const transcriptCalls = structuredCalls.filter(
    call => call.options.builtInRouteId === 'Transcript audio'
  );
  t.is(transcriptCalls.length, 3);
  t.true(transcriptCalls.every(call => call.slot === 'transcript.audio'));
  t.deepEqual(
    transcriptCalls.map(call => call.messages.at(-1)?.attachments),
    [
      [
        {
          attachment:
            'https://canary.copilotcontent.affine.pro/blob-1-0?sig=test',
          mimeType: 'audio/opus',
        },
      ],
      [
        {
          attachment:
            'https://canary.copilotcontent.affine.pro/blob-1-1?sig=test',
          mimeType: 'audio/opus',
        },
      ],
      [
        {
          attachment:
            'https://canary.copilotcontent.affine.pro/blob-1-1?sig=test',
          mimeType: 'audio/opus',
        },
      ],
    ]
  );
  t.is(
    structuredCalls.at(-1)?.messages.at(-1)?.content,
    '00:00:17 A: Kickoff\n00:01:42 B: Follow-up'
  );
  t.like(completeDispatch.firstCall.args[3], {
    status: 'ready',
    errorCode: null,
  });
  Sinon.assert.calledWith(
    attachActionRun,
    'task-1',
    'generation-1',
    null,
    'run-bridge'
  );
  t.is(
    completeDispatch.firstCall.args[3].protectedResult.normalizedTranscript,
    '00:00:17 A: Kickoff\n00:01:42 B: Follow-up'
  );
  t.like(
    completeDispatch.firstCall.args[3].protectedResult.normalizedSegments[1],
    {
      startSec: 102,
      endSec: 342,
      start: '00:01:42',
      end: '00:05:42',
    }
  );
  t.deepEqual(
    completeDispatch.firstCall.args[3].protectedResult.infos,
    payload.infos
  );
});

test('transcriptTask fails task when native action bridge reports an error event', async t => {
  const payload = TranscriptPayloadSchema.parse({
    normalizedTranscript: '00:00:05 A: Kickoff',
  });
  const completeDispatch = Sinon.stub().resolves(true);
  const service = createCopilotTranscriptionService(
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
        claimDispatch: Sinon.stub().resolves(true),
        attachActionRun: Sinon.stub().resolves(true),
        completeDispatch,
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    createTranscriptPromptService() as never,
    {
      runStream: (input: any) =>
        (async function* () {
          await input.onRunCreated?.({ runId: 'run-bridge', attempt: 1 });
          yield {
            type: 'error' as const,
            actionId: 'transcript.audio',
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
        generation: 'generation-1',
      }),
    { message: /native_failed/ }
  );
  t.like(completeDispatch.firstCall.args[3], {
    status: 'failed',
  });
});
