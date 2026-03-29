/* eslint-disable rxjs/finnish */
import type { CopilotChatHistoryFragment } from '@affine/graphql';
import { describe, expect, test, vi } from 'vitest';

import {
  resolveInitialSession,
  type SessionService,
  type WorkbenchLike,
} from './chat-panel-session';

const createWorkbench = (search: string) => {
  const updateQueryString = vi.fn();
  const workbench = {
    location$: { value: { search } },
    activeView$: { value: { updateQueryString } },
  } satisfies WorkbenchLike;

  return { workbench, updateQueryString };
};

const doc = { id: 'doc-1', workspace: { id: 'ws-1' } };

test('returns undefined without session service or doc', async () => {
  await expect(
    resolveInitialSession({ sessionService: null, doc, workbench: null })
  ).resolves.toBeUndefined();
  await expect(
    resolveInitialSession({
      sessionService: {
        getSessions: vi.fn(),
        getSession: vi.fn(),
      },
      doc: null,
      workbench: null,
    })
  ).resolves.toBeUndefined();
});

describe('resolveInitialSession', () => {
  test('loads pinned session when url sessionId is absent', async () => {
    const pinnedSession = {
      sessionId: 'pinned-session',
      pinned: true,
    } as CopilotChatHistoryFragment;

    const sessionService: SessionService = {
      getSessions: vi.fn().mockResolvedValueOnce([pinnedSession]),
      getSession: vi.fn(),
    };

    const { workbench, updateQueryString } = createWorkbench('');

    const result = await resolveInitialSession({
      sessionService,
      doc,
      workbench,
    });

    expect(result).toBe(pinnedSession);
    expect(updateQueryString).not.toHaveBeenCalled();
    expect(sessionService.getSession).not.toHaveBeenCalled();
  });

  test('loads session from url when no pinned session', async () => {
    const sessionFromUrl = {
      sessionId: 'url-session',
      pinned: false,
    } as CopilotChatHistoryFragment;

    const sessionService: SessionService = {
      getSessions: vi.fn().mockResolvedValueOnce([]),
      getSession: vi.fn().mockResolvedValueOnce(sessionFromUrl),
    };

    const { workbench, updateQueryString } = createWorkbench(
      '?sessionId=url-session'
    );

    const result = await resolveInitialSession({
      sessionService,
      doc,
      workbench,
    });

    expect(result).toBe(sessionFromUrl);
    expect(sessionService.getSession).toHaveBeenCalledWith(
      doc.workspace.id,
      'url-session'
    );
    expect(updateQueryString).toHaveBeenCalledWith(
      { sessionId: undefined },
      { replace: true }
    );
  });

  test('falls back to latest doc session', async () => {
    const docSession = {
      sessionId: 'doc-session',
      pinned: false,
    } as CopilotChatHistoryFragment;

    const sessionService: SessionService = {
      getSessions: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([docSession]),
      getSession: vi.fn(),
    };

    const { workbench } = createWorkbench('');

    const result = await resolveInitialSession({
      sessionService,
      doc,
      workbench,
    });

    expect(result).toBe(docSession);
    expect(sessionService.getSessions).toHaveBeenCalledWith(
      doc.workspace.id,
      doc.id,
      { action: false, fork: false, limit: 1 }
    );
  });

  test('returns null when url session is missing', async () => {
    const sessionService: SessionService = {
      getSessions: vi.fn().mockResolvedValueOnce([]),
      getSession: vi.fn().mockResolvedValueOnce(null),
    };

    const { workbench } = createWorkbench('?sessionId=missing');

    const result = await resolveInitialSession({
      sessionService,
      doc,
      workbench,
    });

    expect(result).toBeNull();
  });

  test('prefers doc scoped session when preferredSessionId is provided', async () => {
    const docScopedSession = {
      sessionId: 'session-doc-1',
      pinned: false,
    } as CopilotChatHistoryFragment;

    const sessionService: SessionService = {
      getSessions: vi.fn(),
      getSession: vi.fn().mockResolvedValueOnce(docScopedSession),
    };

    const { workbench } = createWorkbench('');

    const result = await resolveInitialSession({
      sessionService,
      doc,
      workbench,
      preferredSessionId: 'session-doc-1',
    });

    expect(result).toBe(docScopedSession);
    expect(sessionService.getSession).toHaveBeenCalledWith(
      doc.workspace.id,
      'session-doc-1'
    );
    expect(sessionService.getSessions).not.toHaveBeenCalled();
  });

  test('returns null when preferredSessionId does not exist', async () => {
    const sessionService: SessionService = {
      getSessions: vi.fn(),
      getSession: vi.fn().mockRejectedValueOnce(new Error('HTTP error 404')),
    };

    const { workbench } = createWorkbench('');

    const result = await resolveInitialSession({
      sessionService,
      doc,
      workbench,
      preferredSessionId: 'session-doc-1',
    });

    expect(result).toBeNull();
  });
});
