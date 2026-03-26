import test from 'ava';

import {
  buildLegacyProjection,
  buildNormalizedTranscript,
  normalizeTranscriptSegments,
} from '../../plugins/copilot/transcript/projection';
import { TranscriptPayloadSchema } from '../../plugins/copilot/transcript/schema';

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
    ['00:00:10 A: first', '00:00:13 B: second', '00:00:16 C: third'].join(
      '\n'
    )
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
