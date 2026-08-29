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
