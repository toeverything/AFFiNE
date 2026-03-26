import { AiJobStatus } from '@prisma/client';
import test from 'ava';
import Sinon from 'sinon';

import {
  buildLegacyProjection,
  buildNormalizedTranscript,
  normalizeTranscriptSegments,
} from '../../plugins/copilot/transcript/projection';
import { TranscriptPayloadSchema } from '../../plugins/copilot/transcript/schema';
import { CopilotTranscriptionService } from '../../plugins/copilot/transcript/service';

test('normalizeTranscriptSegments trims, sorts and clips overlaps', t => {
  const normalized = normalizeTranscriptSegments([
    {
      source: 'asr',
      sliceIndex: 1,
      speaker: ' B ',
      startSec: 12,
      endSec: 16,
      text: ' second ',
    },
    {
      source: 'asr',
      sliceIndex: 0,
      speaker: 'A',
      startSec: 10,
      endSec: 13,
      text: ' first ',
    },
    {
      source: 'asr',
      sliceIndex: 1,
      speaker: 'B',
      startSec: 12,
      endSec: 16,
      text: 'second',
    },
    {
      source: 'asr',
      sliceIndex: 2,
      speaker: '',
      startSec: 16,
      endSec: 18,
      text: '   ',
    },
    {
      source: 'asr',
      sliceIndex: 2,
      speaker: 'C',
      startSec: 15,
      endSec: 20,
      text: 'third',
    },
  ]);

  t.deepEqual(normalized, [
    {
      speaker: 'A',
      startSec: 10,
      endSec: 13,
      start: '00:00:10',
      end: '00:00:13',
      text: 'first',
    },
    {
      speaker: 'B',
      startSec: 13,
      endSec: 16,
      start: '00:00:13',
      end: '00:00:16',
      text: 'second',
    },
    {
      speaker: 'C',
      startSec: 16,
      endSec: 20,
      start: '00:00:16',
      end: '00:00:20',
      text: 'third',
    },
  ]);

  t.is(
    buildNormalizedTranscript(normalized),
    ['00:00:10 A: first', '00:00:13 B: second', '00:00:16 C: third'].join('\n')
  );
});

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

test('TranscriptPayloadSchema keeps legacy payload readable as v2', t => {
  const parsed = TranscriptPayloadSchema.parse({
    url: 'https://example.com/audio.opus',
    mimeType: 'audio/opus',
    title: 'Legacy title',
    summary: '- summary',
    actions: '- [ ] task',
    transcription: [
      {
        speaker: 'A',
        start: '00:00:01',
        end: '00:00:03',
        transcription: 'legacy line',
      },
    ],
  });

  t.deepEqual(parsed.infos, [
    {
      url: 'https://example.com/audio.opus',
      mimeType: 'audio/opus',
      index: 0,
    },
  ]);
  t.deepEqual(parsed.legacy, {
    title: 'Legacy title',
    summary: '- summary',
    actions: '- [ ] task',
    transcription: [
      {
        speaker: 'A',
        start: '00:00:01',
        end: '00:00:03',
        transcription: 'legacy line',
      },
    ],
  });
});

test('TranscriptPayloadSchema rejects empty legacy payloads', t => {
  const emptyError = t.throws(() => TranscriptPayloadSchema.parse({}));
  t.truthy(emptyError);

  const unknownOnlyError = t.throws(() =>
    TranscriptPayloadSchema.parse({ foo: 'bar' })
  );
  t.truthy(unknownOnlyError);
});

test('transcriptAudio persists transcript payload before summary failure', async t => {
  const event = { emit: Sinon.spy() };
  const persistedPayloads: any[] = [];
  let currentPayload: any = {};
  const service = new CopilotTranscriptionService(
    event as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );

  Sinon.stub(service as any, 'callTranscript').resolves([
    {
      source: 'asr',
      sliceIndex: 0,
      speaker: 'A',
      startSec: 5,
      endSec: 9,
      text: 'Kickoff',
    },
    {
      source: 'asr',
      sliceIndex: 0,
      speaker: 'B',
      startSec: 10,
      endSec: 14,
      text: 'Status update',
    },
  ]);
  Sinon.stub(service as any, 'summarizeMeeting').rejects(
    new Error('summary provider unavailable')
  );
  Sinon.stub(service as any, 'updatePayload').callsFake(
    async (...args: any[]) => {
      const updater = args[1] as (payload: any) => any;
      currentPayload = await updater(currentPayload);
      persistedPayloads.push(currentPayload);
      return currentPayload;
    }
  );

  await t.throwsAsync(() =>
    service.transcriptAudio({
      jobId: 'job-1',
      modelId: 'model-1',
      payload: {
        infos: [
          {
            url: 'https://example.com/audio-0.m4a',
            mimeType: 'audio/m4a',
            index: 0,
          },
        ],
        sliceManifest: [
          {
            index: 0,
            fileName: 'audio-0.m4a',
            mimeType: 'audio/m4a',
            startSec: 0,
            durationSec: 30,
          },
        ],
      },
    } as Jobs['copilot.transcript.submit'])
  );

  t.is(persistedPayloads.length, 2);
  t.deepEqual(
    persistedPayloads[0].rawSegments?.map((segment: any) => segment.text),
    ['Kickoff', 'Status update']
  );
  t.deepEqual(
    persistedPayloads[0].normalizedSegments?.map(
      (segment: any) => segment.start
    ),
    ['00:00:05', '00:00:10']
  );
  t.is(
    persistedPayloads[0].normalizedTranscript,
    ['00:00:05 A: Kickoff', '00:00:10 B: Status update'].join('\n')
  );
  t.is(persistedPayloads[0].summaryJson, null);
  t.deepEqual(persistedPayloads[1].retryMeta, { skipAsrOnRetry: true });
  Sinon.assert.calledWith(event.emit, 'workspace.file.transcript.failed', {
    jobId: 'job-1',
  });
});

test('transcriptAudio reuses persisted transcript once after summary failure', async t => {
  const event = { emit: Sinon.spy() };
  let currentPayload: any = {
    infos: [
      {
        url: 'https://example.com/audio-0.m4a',
        mimeType: 'audio/m4a',
        index: 0,
      },
    ],
    rawSegments: [
      {
        source: 'asr',
        sliceIndex: 0,
        speaker: 'A',
        startSec: 5,
        endSec: 9,
        text: 'Kickoff',
      },
    ],
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
    summaryJson: null,
    retryMeta: { skipAsrOnRetry: true },
  };
  const service = new CopilotTranscriptionService(
    event as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );

  const callTranscript = Sinon.stub(service as any, 'callTranscript');
  Sinon.stub(service as any, 'summarizeMeeting').resolves({
    title: 'Weekly Sync',
    durationMinutes: 12,
    attendees: ['A'],
    keyPoints: ['Kickoff'],
    actionItems: [],
    decisions: [],
    openQuestions: [],
    blockers: [],
  });
  Sinon.stub(service as any, 'updatePayload').callsFake(
    async (...args: any[]) => {
      const updater = args[1] as (payload: any) => any;
      currentPayload = await updater(currentPayload);
      return currentPayload;
    }
  );

  await service.transcriptAudio({
    jobId: 'job-2',
    modelId: 'model-1',
    payload: currentPayload,
  } as Jobs['copilot.transcript.submit']);

  Sinon.assert.notCalled(callTranscript);
  t.is(currentPayload.summaryJson?.title, 'Weekly Sync');
  t.is(currentPayload.retryMeta, undefined);
  Sinon.assert.calledWith(event.emit, 'workspace.file.transcript.finished', {
    jobId: 'job-2',
  });
});

test('transcriptAudio clears reuse flag after repeated summary failure', async t => {
  const event = { emit: Sinon.spy() };
  let currentPayload: any = {
    infos: [
      {
        url: 'https://example.com/audio-0.m4a',
        mimeType: 'audio/m4a',
        index: 0,
      },
    ],
    rawSegments: [
      {
        source: 'asr',
        sliceIndex: 0,
        speaker: 'A',
        startSec: 5,
        endSec: 9,
        text: 'Kickoff',
      },
    ],
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
    summaryJson: null,
    retryMeta: { skipAsrOnRetry: true },
  };
  const service = new CopilotTranscriptionService(
    event as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );

  const callTranscript = Sinon.stub(service as any, 'callTranscript');
  Sinon.stub(service as any, 'summarizeMeeting').rejects(
    new Error('summary still unavailable')
  );
  Sinon.stub(service as any, 'updatePayload').callsFake(
    async (...args: any[]) => {
      const updater = args[1] as (payload: any) => any;
      currentPayload = await updater(currentPayload);
      return currentPayload;
    }
  );

  await t.throwsAsync(() =>
    service.transcriptAudio({
      jobId: 'job-3',
      modelId: 'model-1',
      payload: currentPayload,
    } as Jobs['copilot.transcript.submit'])
  );

  Sinon.assert.notCalled(callTranscript);
  t.is(currentPayload.retryMeta, undefined);
  t.is(currentPayload.normalizedTranscript, '00:00:05 A: Kickoff');
  Sinon.assert.calledWith(event.emit, 'workspace.file.transcript.failed', {
    jobId: 'job-3',
  });
});

test('queryJob returns transcript payload for finished jobs', async t => {
  const payload = TranscriptPayloadSchema.parse({
    infos: [
      {
        url: 'https://example.com/audio-0.m4a',
        mimeType: 'audio/m4a',
        index: 0,
      },
    ],
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
  });
  const service = new CopilotTranscriptionService(
    {} as never,
    {
      copilotJob: {
        getWithUser: Sinon.stub().resolves({
          id: 'job-4',
          status: AiJobStatus.finished,
          payload,
        }),
      },
    } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );

  const result = await service.queryJob('user-1', 'workspace-1', 'job-4');

  t.is(result?.status, AiJobStatus.finished);
  t.deepEqual(result?.infos, payload.infos);
  t.is(result?.transcription?.normalizedTranscript, '00:00:05 A: Kickoff');
});

test('createCanonicalPayload keeps sliceManifest undefined when input omits it', async t => {
  const service = new CopilotTranscriptionService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );

  const payload = await (service as any).createCanonicalPayload('blob-1', [
    {
      url: 'https://example.com/audio-0.m4a',
      mimeType: 'audio/m4a',
      index: 0,
    },
    {
      url: 'https://example.com/audio-1.m4a',
      mimeType: 'audio/m4a',
      index: 1,
    },
  ]);

  t.is(payload.sliceManifest, undefined);
});

test('transcriptAudio derives manifest-less slice offsets from observed durations', async t => {
  const event = { emit: Sinon.spy() };
  let currentPayload: any = {};
  const service = new CopilotTranscriptionService(
    event as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );

  const callTranscript = Sinon.stub(service as any, 'callTranscript');
  callTranscript.onCall(0).resolves([
    {
      source: 'asr',
      sliceIndex: 0,
      speaker: 'A',
      startSec: 30,
      endSec: 45,
      text: 'Hello, everyone.',
    },
    {
      source: 'asr',
      sliceIndex: 0,
      speaker: 'B',
      startSec: 46,
      endSec: 70,
      text: 'Hi, thank you for joining the meeting today.',
    },
  ]);
  callTranscript.onCall(1).resolves([
    {
      source: 'asr',
      sliceIndex: 1,
      speaker: 'A',
      startSec: 30,
      endSec: 45,
      text: 'Second slice hello.',
    },
    {
      source: 'asr',
      sliceIndex: 1,
      speaker: 'B',
      startSec: 46,
      endSec: 70,
      text: 'Second slice response.',
    },
  ]);
  Sinon.stub(service as any, 'summarizeMeeting').resolves({
    title: 'Weekly Sync',
    durationMinutes: 12,
    attendees: ['A', 'B'],
    keyPoints: ['Reviewed launch status'],
    actionItems: [],
    decisions: [],
    openQuestions: [],
    blockers: [],
  });
  Sinon.stub(service as any, 'updatePayload').callsFake(
    async (...args: any[]) => {
      const updater = args[1] as (payload: any) => any;
      currentPayload = await updater(currentPayload);
      return currentPayload;
    }
  );

  await service.transcriptAudio({
    jobId: 'job-5',
    modelId: 'model-1',
    payload: {
      infos: [
        {
          url: 'https://example.com/audio-0.m4a',
          mimeType: 'audio/m4a',
          index: 0,
        },
        {
          url: 'https://example.com/audio-1.m4a',
          mimeType: 'audio/m4a',
          index: 1,
        },
      ],
    },
  } as Jobs['copilot.transcript.submit']);

  t.deepEqual(
    currentPayload.normalizedSegments?.map((segment: any) => segment.start),
    ['00:00:30', '00:00:46', '00:01:40', '00:01:56']
  );
  t.is(
    currentPayload.normalizedTranscript?.split('\n')[2],
    '00:01:40 A: Second slice hello.'
  );
  t.is(currentPayload.sliceManifest, undefined);
});
