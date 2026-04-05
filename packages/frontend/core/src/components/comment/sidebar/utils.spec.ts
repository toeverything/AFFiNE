import { describe, expect, test } from 'vitest';

import type { DocComment } from '../../../modules/comment/types';
import {
  type CommentFilterState,
  getVisibleComments,
  shouldResetCommentDisplayModeOnDocChange,
  shouldResetFocusedCommentsOnSidebarClick,
} from './utils';

const defaultFilterState: CommentFilterState = {
  showResolvedComments: false,
  onlyMyReplies: false,
  onlyCurrentMode: false,
};

function createComment(
  overrides: Partial<DocComment> & Pick<DocComment, 'id'>
) {
  const base: DocComment = {
    id: overrides.id,
    createdAt: 1,
    updatedAt: 1,
    resolved: false,
    mentions: [],
    replies: [],
    user: {
      id: 'user-1',
      name: 'User 1',
      avatarUrl: null,
    },
    content: {
      snapshot: { blocks: {}, meta: { pages: {} } } as never,
      mode: 'page',
      preview: 'preview',
      attachments: [],
    },
  };

  return {
    ...base,
    ...overrides,
  };
}

describe('getVisibleComments', () => {
  test('shows only the focused comment when sidebar is in focused mode', () => {
    const comments = [
      createComment({ id: 'comment-1', createdAt: 10 }),
      createComment({ id: 'comment-2', createdAt: 20, resolved: true }),
    ];

    const result = getVisibleComments({
      comments,
      displayMode: {
        type: 'focused',
        commentId: 'comment-2',
      },
      filterState: defaultFilterState,
      docMode: 'page',
    });

    expect(result.map(comment => comment.id)).toEqual(['comment-2']);
  });

  test('shows only matching comments when sidebar is in subset mode', () => {
    const comments = [
      createComment({ id: 'comment-1', createdAt: 10 }),
      createComment({ id: 'comment-2', createdAt: 20, resolved: true }),
      createComment({ id: 'comment-3', createdAt: 30 }),
      createComment({ id: 'comment-4', createdAt: 40 }),
    ];

    const result = getVisibleComments({
      comments,
      displayMode: {
        type: 'subset',
        commentIds: ['comment-1', 'comment-3'],
      },
      filterState: defaultFilterState,
      docMode: 'page',
    });

    expect(result.map(comment => comment.id)).toEqual([
      'comment-3',
      'comment-1',
    ]);
  });

  test('shows empty list when subset ids are stale', () => {
    const result = getVisibleComments({
      comments: [createComment({ id: 'comment-1' })],
      displayMode: {
        type: 'subset',
        commentIds: ['missing'],
      },
      filterState: defaultFilterState,
      docMode: 'page',
    });

    expect(result).toEqual([]);
  });

  test('hides existing comments when sidebar is in pending mode', () => {
    const comments = [
      createComment({ id: 'comment-1', createdAt: 10 }),
      createComment({ id: 'comment-2', createdAt: 20 }),
    ];

    const result = getVisibleComments({
      comments,
      displayMode: {
        type: 'pending',
      } as never,
      filterState: defaultFilterState,
      docMode: 'page',
    });

    expect(result).toEqual([]);
  });

  test('shows all filtered comments when sidebar is in all mode', () => {
    const comments = [
      createComment({ id: 'comment-1', createdAt: 10 }),
      createComment({ id: 'comment-2', createdAt: 20, resolved: true }),
      createComment({
        id: 'comment-3',
        createdAt: 30,
        content: {
          snapshot: { blocks: {}, meta: { pages: {} } } as never,
          mode: 'edgeless',
          preview: 'preview',
          attachments: [],
        },
      }),
    ];

    const result = getVisibleComments({
      comments,
      displayMode: {
        type: 'all',
      },
      filterState: {
        ...defaultFilterState,
        onlyCurrentMode: true,
      },
      docMode: 'page',
    });

    expect(result.map(comment => comment.id)).toEqual(['comment-1']);
  });
});

describe('shouldResetFocusedCommentsOnSidebarClick', () => {
  test('does not reset focused comments when clicking empty sidebar space', () => {
    const target = {
      closest: () => null,
    } as unknown as HTMLElement;

    expect(shouldResetFocusedCommentsOnSidebarClick(target)).toBe(false);
  });

  test('does not reset focused comments when clicking inside a comment thread', () => {
    const target = {
      closest: (selector: string) =>
        selector === '[data-comment-id]' ? {} : null,
    } as unknown as HTMLElement;

    expect(shouldResetFocusedCommentsOnSidebarClick(target)).toBe(false);
  });
});

describe('shouldResetCommentDisplayModeOnDocChange', () => {
  test('does not reset comment display mode on first mount', () => {
    expect(shouldResetCommentDisplayModeOnDocChange(undefined, 'doc-1')).toBe(
      false
    );
  });

  test('does not reset comment display mode when staying on the same doc', () => {
    expect(shouldResetCommentDisplayModeOnDocChange('doc-1', 'doc-1')).toBe(
      false
    );
  });

  test('resets comment display mode when doc changes', () => {
    expect(shouldResetCommentDisplayModeOnDocChange('doc-1', 'doc-2')).toBe(
      true
    );
  });
});
