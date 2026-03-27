import { describe, expect, test } from 'vitest';

import type { DocComment } from '../../../modules/comment/types';
import {
  type CommentFilterState,
  getVisibleComments,
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
