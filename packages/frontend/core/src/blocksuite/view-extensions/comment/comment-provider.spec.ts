/**
 * @vitest-environment happy-dom
 */

import { DocCommentManagerService } from '@affine/core/modules/comment/services/doc-comment-manager';
import { PeekViewService } from '@affine/core/modules/peek-view';
import { WorkbenchService } from '@affine/core/modules/workbench';
import {
  CommentProviderIdentifier,
  DocModeProvider,
} from '@blocksuite/affine/shared/services';
import { StdIdentifier } from '@blocksuite/affine/std';
import { Container } from '@blocksuite/global/di';
import type { FrameworkProvider } from '@toeverything/infra';
import { describe, expect, test, vi } from 'vitest';

import { AffineCommentProvider } from './comment-provider';

function setup(isInPeekView: boolean) {
  const commentEntity = {
    addComment: vi.fn(() => Promise.resolve('pending')),
    highlightComment: vi.fn(),
  };
  const openInWorkbench = vi.fn();
  const activeSidebarTab = vi.fn();
  const workbench = {
    setSidebarOpen: vi.fn(),
    activeView$: { value: { activeSidebarTab } },
  };
  const services = new Map<unknown, unknown>([
    [DocCommentManagerService, { get: () => ({ obj: commentEntity }) }],
    [PeekViewService, { peekView: { openInWorkbench } }],
    [WorkbenchService, { workbench }],
  ]);
  const framework = {
    get: (service: unknown) => services.get(service),
  } as unknown as FrameworkProvider;
  const std = {
    store: { id: 'doc-1' },
    getOptional: (identifier: unknown) =>
      identifier === DocModeProvider
        ? { getEditorMode: () => 'edgeless' }
        : null,
  };

  const container = new Container();
  container.addImpl(StdIdentifier, () => std as never);
  AffineCommentProvider(framework, isInPeekView).setup(container);
  const provider = container.provider().get(CommentProviderIdentifier);

  return { provider, commentEntity, openInWorkbench, activeSidebarTab };
}

describe('AffineCommentProvider', () => {
  test.each([
    {
      name: 'opens a doc in peek view at the clicked comment',
      isInPeekView: true,
      opened: [{ docId: 'doc-1', mode: 'edgeless', commentId: 'comment-1' }],
    },
    {
      name: 'keeps a doc in the workbench where it is',
      isInPeekView: false,
      opened: [],
    },
  ])('$name', ({ isInPeekView, opened }) => {
    const { provider, commentEntity, openInWorkbench, activeSidebarTab } =
      setup(isInPeekView);

    provider.highlightComment('comment-1');

    expect(openInWorkbench.mock.calls.map(([docRef]) => docRef)).toEqual(
      opened
    );
    expect(activeSidebarTab).toHaveBeenCalledWith('comment');
    expect(commentEntity.highlightComment).toHaveBeenCalledWith('comment-1');
  });

  test('opens a doc in peek view in the workbench to add a comment', () => {
    const { provider, commentEntity, openInWorkbench, activeSidebarTab } =
      setup(true);

    provider.addComment([]);

    expect(openInWorkbench).toHaveBeenCalledWith({
      docId: 'doc-1',
      mode: 'edgeless',
      commentId: undefined,
    });
    expect(activeSidebarTab).toHaveBeenCalledWith('comment');
    expect(commentEntity.addComment).toHaveBeenCalledWith([], '');
  });
});
