import { describe, expect, test } from 'vitest';

import {
  actionItemsToMarkdown,
  buildTranscriptionResult,
  summaryJsonToMarkdown,
} from './transcription-result';

describe('transcription-result', () => {
  test('prefers new fields and projects markdown from summaryJson', () => {
    const result = buildTranscriptionResult({
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
        blockers: ['Waiting on analytics'],
      },
      normalizedSegments: [
        {
          speaker: 'A',
          startSec: 1,
          endSec: 3,
          start: '00:00:01',
          end: '00:00:03',
          text: 'Kickoff',
        },
      ],
    });

    expect(result).toEqual({
      title: 'Weekly Sync',
      summary: [
        '- Reviewed launch status',
        '## Decisions',
        '- Ship on Monday',
        '## Open Questions',
        '- Need final QA sign-off',
        '## Blockers',
        '- Waiting on analytics',
      ].join('\n'),
      actions: '- [ ] Send recap (A · Friday)',
      segments: [
        {
          speaker: 'A',
          start: '00:00:01',
          end: '00:00:03',
          transcription: 'Kickoff',
        },
      ],
    });
  });

  test('falls back to legacy fields when they exist', () => {
    const result = buildTranscriptionResult({
      title: 'Legacy title',
      summary: 'legacy summary',
      actions: 'legacy actions',
      transcription: [
        {
          speaker: 'B',
          start: '00:00:04',
          end: '00:00:06',
          transcription: 'Legacy line',
        },
      ],
      summaryJson: {
        title: 'New title',
        durationMinutes: 5,
        attendees: [],
        keyPoints: ['new'],
        actionItems: [],
        decisions: [],
        openQuestions: [],
        blockers: [],
      },
      normalizedSegments: [
        {
          speaker: 'A',
          startSec: 1,
          endSec: 2,
          start: '00:00:01',
          end: '00:00:02',
          text: 'new',
        },
      ],
    });

    expect(result).toEqual({
      title: 'Legacy title',
      summary: 'legacy summary',
      actions: 'legacy actions',
      segments: [
        {
          speaker: 'B',
          start: '00:00:04',
          end: '00:00:06',
          transcription: 'Legacy line',
        },
      ],
    });
  });

  test('returns empty markdown when summaryJson is absent', () => {
    expect(summaryJsonToMarkdown(null)).toBe('');
    expect(actionItemsToMarkdown(null)).toBe('');
  });
});
