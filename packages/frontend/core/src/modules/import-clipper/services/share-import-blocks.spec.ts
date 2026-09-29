import { describe, expect, test } from 'vitest';

import {
  createShareBlockPlan,
  reconcileShareTitles,
  shareImportBlockIds,
  validatesStableBlock,
} from './share-block-plan';

const input = () => ({
  documentId: 'document-id',
  importAttemptId: 'attempt-id',
  title: 'Saved title',
  content: {
    kind: 'url' as const,
    url: 'https://youtube.com/watch?v=123',
    text: 'Selected text',
  },
  tagIds: [],
});

describe('share import block plan', () => {
  test('uses the existing embed option and only writes its required source props', () => {
    expect(
      createShareBlockPlan(input(), {
        flavour: 'affine:embed-youtube',
        styles: ['video'],
      })
    ).toEqual([
      {
        id: 'share-attempt-id-bookmark',
        flavour: 'affine:embed-youtube',
        props: {
          url: 'https://youtube.com/watch?v=123',
          style: 'video',
        },
      },
      {
        id: 'share-attempt-id-selected-text',
        flavour: 'affine:paragraph',
        props: { type: 'quote', text: 'Selected text' },
      },
    ]);
  });

  test('falls back to a URL-only bookmark when no embed option is registered', () => {
    expect(createShareBlockPlan(input())[0]).toEqual({
      id: 'share-attempt-id-bookmark',
      flavour: 'affine:bookmark',
      props: {
        url: 'https://youtube.com/watch?v=123',
        style: 'horizontal',
      },
    });
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
});
