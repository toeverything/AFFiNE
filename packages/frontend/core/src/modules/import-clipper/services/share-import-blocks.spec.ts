import { describe, expect, test } from 'vitest';

import {
  createShareBlockPlan,
  mergeShareDestinationMetadata,
  reconcileShareTitles,
  shareImportBlockIds,
  validatesStableBlock,
} from './share-block-plan';

describe('share import block plan', () => {
  test('uses stable semantic ids and bookmark blocks for every URL', () => {
    const input = {
      documentId: 'document-id',
      importAttemptId: 'attempt-id',
      title: 'Saved title',
      content: {
        kind: 'url' as const,
        url: 'https://youtube.com/watch?v=123',
        text: 'Selected text',
      },
      preview: { url: 'https://youtube.com/watch?v=123', title: 'Preview' },
      tagIds: [],
    };

    expect(
      createShareBlockPlan(input, {
        flavour: 'affine:embed-youtube',
        styles: ['video'],
      })
    ).toEqual([
      expect.objectContaining({
        id: 'share-attempt-id-bookmark',
        flavour: 'affine:bookmark',
        props: expect.objectContaining({
          url: input.content.url,
          title: 'Preview',
        }),
      }),
      expect.objectContaining({
        id: 'share-attempt-id-selected-text',
        flavour: 'affine:paragraph',
      }),
    ]);
  });

  test('falls back to the URL hostname for an empty shared title', () => {
    const plan = createShareBlockPlan(
      {
        documentId: 'document-id',
        importAttemptId: 'attempt-id',
        title: '   ',
        content: { kind: 'url', url: 'https://example.com/a' },
        tagIds: [],
      },
      null
    );

    expect(plan[0]?.props).toMatchObject({ title: 'example.com' });
  });

  test('keeps existing stable blocks unchanged and rejects parent or flavour collisions', () => {
    const ids = shareImportBlockIds('attempt-id');
    const originalProps = { url: 'https://edited.example', title: 'Edited' };
    const existing = {
      flavour: 'affine:bookmark',
      parentId: ids.note,
      props: originalProps,
    };

    expect(
      validatesStableBlock(existing, {
        flavour: 'affine:bookmark',
        parentId: ids.note,
      })
    ).toBe(true);
    expect(existing.props).toBe(originalProps);
    expect(
      validatesStableBlock(existing, {
        flavour: 'affine:image',
        parentId: ids.note,
      })
    ).toBe(false);
    expect(
      validatesStableBlock(existing, {
        flavour: 'affine:bookmark',
        parentId: 'user-note',
      })
    ).toBe(false);
  });

  test('uses one deterministic image ID so retries do not create another image', () => {
    const ids = shareImportBlockIds('attempt-id');
    expect(ids.image).toBe('share-attempt-id-image');
    expect(shareImportBlockIds('attempt-id').image).toBe(ids.image);
  });

  test('uses one deterministic attachment ID for a PDF retry', () => {
    const ids = shareImportBlockIds('attempt-id');

    expect(ids.attachment).toBe('share-attempt-id-attachment');
    expect(shareImportBlockIds('attempt-id').attachment).toBe(ids.attachment);
  });

  test('uses exact deterministic rich-preview ids including original response indexes', () => {
    const ids = shareImportBlockIds('attempt-id');

    expect(ids.metadata).toBe('share-attempt-id-metadata');
    expect(ids.transcript).toBe('share-attempt-id-transcript');
    expect(ids.transcriptHeading).toBe('share-attempt-id-transcript-heading');
    expect(ids.transcriptChapter(7)).toBe(
      'share-attempt-id-transcript-chapter-7'
    );
    expect(ids.transcriptSegment(9)).toBe(
      'share-attempt-id-transcript-segment-9'
    );
  });

  test('projects rich metadata, selected text, and a collapsed timestamped transcript', () => {
    const plan = createShareBlockPlan(
      {
        documentId: 'document-id',
        importAttemptId: 'attempt-id',
        title: 'Shared',
        content: {
          kind: 'url',
          url: 'https://youtube.com/watch?v=123',
          text: 'Selected passage',
        },
        preview: {
          url: 'https://youtube.com/watch?v=123',
          title: 'Video title',
          description: 'Video description',
          provider: 'youtube',
          author: { name: 'Author' },
          durationSeconds: 214.9,
          transcript: {
            segments: [
              { text: '   ' },
              { text: ' selected\n passage ' },
              { text: 'Welcome', startSeconds: 1.9, speaker: 'Host' },
              { text: 'Untimed words' },
            ],
            chapters: [
              { title: 'Second equal chapter', startSeconds: 1 },
              { title: 'First equal chapter', startSeconds: 1 },
              { title: 'After all segments', startSeconds: 10.8 },
            ],
          },
        },
        tagIds: [],
      },
      null
    );

    expect(plan).toEqual([
      expect.objectContaining({
        id: 'share-attempt-id-bookmark',
        flavour: 'affine:bookmark',
      }),
      {
        id: 'share-attempt-id-metadata',
        flavour: 'affine:paragraph',
        props: { type: 'text', text: 'YouTube · Author · 3:34' },
      },
      {
        id: 'share-attempt-id-selected-text',
        flavour: 'affine:paragraph',
        props: { type: 'quote', text: 'Selected passage' },
      },
      {
        id: 'share-attempt-id-transcript',
        flavour: 'affine:callout',
        props: { backgroundColorName: 'grey' },
        children: [
          {
            id: 'share-attempt-id-transcript-heading',
            flavour: 'affine:paragraph',
            props: { type: 'h6', text: 'Transcript', collapsed: true },
          },
          {
            id: 'share-attempt-id-transcript-chapter-0',
            flavour: 'affine:paragraph',
            props: { type: 'text', text: '[0:01] Second equal chapter' },
          },
          {
            id: 'share-attempt-id-transcript-chapter-1',
            flavour: 'affine:paragraph',
            props: { type: 'text', text: '[0:01] First equal chapter' },
          },
          {
            id: 'share-attempt-id-transcript-segment-2',
            flavour: 'affine:paragraph',
            props: { type: 'text', text: '[0:01] Host: Welcome' },
          },
          {
            id: 'share-attempt-id-transcript-segment-3',
            flavour: 'affine:paragraph',
            props: { type: 'text', text: 'Untimed words' },
          },
          {
            id: 'share-attempt-id-transcript-chapter-2',
            flavour: 'affine:paragraph',
            props: { type: 'text', text: '[0:10] After all segments' },
          },
        ],
      },
    ]);
  });

  test('omits absent metadata and transcripts duplicated by description or selected text', () => {
    const descriptionDuplicate = createShareBlockPlan(
      {
        documentId: 'document-id',
        importAttemptId: 'attempt-id',
        title: 'Post',
        content: { kind: 'url', url: 'https://example.com' },
        preview: {
          url: 'https://example.com',
          description: 'A complete post',
          transcript: {
            segments: [{ text: ' A\u2003complete ' }, { text: ' POST ' }],
          },
        },
        tagIds: [],
      },
      null
    );
    const selectedDuplicate = createShareBlockPlan(
      {
        documentId: 'document-id',
        importAttemptId: 'other-attempt',
        title: 'Post',
        content: {
          kind: 'url',
          url: 'https://example.com',
          text: 'quoted\u2028text',
        },
        preview: {
          url: 'https://example.com',
          transcript: {
            segments: [
              { text: ' QUOTED text ' },
              { text: 'Remaining segment', startSeconds: 2.8 },
            ],
          },
        },
        tagIds: [],
      },
      null
    );

    expect(
      descriptionDuplicate.some(node => node.flavour === 'affine:callout')
    ).toBe(false);
    expect(
      descriptionDuplicate.some(node => node.id.endsWith('-metadata'))
    ).toBe(false);
    expect(selectedDuplicate.at(-1)).toMatchObject({
      id: 'share-other-attempt-transcript',
      children: [
        expect.objectContaining({
          id: 'share-other-attempt-transcript-heading',
        }),
        expect.objectContaining({
          id: 'share-other-attempt-transcript-segment-1',
          props: { type: 'text', text: '[0:02] Remaining segment' },
        }),
      ],
    });
  });

  test('caps projection at 500 original segments and never invents ids for empty entries', () => {
    const plan = createShareBlockPlan(
      {
        documentId: 'document-id',
        importAttemptId: 'attempt-id',
        title: 'Long transcript',
        content: { kind: 'url', url: 'https://example.com' },
        preview: {
          url: 'https://example.com',
          transcript: {
            segments: [
              { text: '   ' },
              ...Array.from({ length: 500 }, (_, index) => ({
                text: `Segment ${index}`,
              })),
            ],
          },
        },
        tagIds: [],
      },
      null
    );
    const transcript = plan.find(node => node.id.endsWith('-transcript'));
    const segmentIds =
      transcript?.children
        ?.map(node => node.id)
        .filter(id => id.includes('-transcript-segment-')) ?? [];

    expect(segmentIds).toHaveLength(499);
    expect(segmentIds[0]).toBe('share-attempt-id-transcript-segment-1');
    expect(segmentIds.at(-1)).toBe('share-attempt-id-transcript-segment-499');
    expect(segmentIds).not.toContain('share-attempt-id-transcript-segment-500');
  });

  test('does not plan over user-added blocks because it only names share-owned IDs', () => {
    const ids = shareImportBlockIds('attempt-id');
    const plan = createShareBlockPlan(
      {
        documentId: 'document-id',
        importAttemptId: 'attempt-id',
        title: 'Shared',
        content: { kind: 'url', url: 'https://example.com' },
        tagIds: [],
      },
      null
    );
    expect(plan.map(block => block.id)).not.toContain('user-added-block');
    expect(plan.map(block => block.id)).toEqual([ids.bookmark]);
  });

  test.each([
    ['', '', 'Import', { rootTitle: 'Import', pageTitle: 'Import' }],
    ['Root', '', 'Import', { rootTitle: 'Root', pageTitle: 'Root' }],
    ['', 'Page', 'Import', { rootTitle: 'Page', pageTitle: 'Page' }],
    ['Root', 'Page', 'Import', { rootTitle: 'Root', pageTitle: 'Page' }],
  ])(
    'reconciles title state %# without overwriting user text',
    (rootTitle, pageTitle, importTitle, expected) => {
      expect(
        reconcileShareTitles({ rootTitle, pageTitle, importTitle })
      ).toEqual(expected);
    }
  );

  test('merges tags and collections monotonically without removing user choices', () => {
    expect(
      mergeShareDestinationMetadata({
        existingTagIds: ['user-tag'],
        requestedTagIds: ['user-tag', 'shared-tag'],
        existingCollectionIds: ['user-collection'],
        requestedCollectionId: 'shared-collection',
      })
    ).toEqual({
      tagIds: new Set(['user-tag', 'shared-tag']),
      collectionIds: new Set(['user-collection', 'shared-collection']),
    });
  });
});
