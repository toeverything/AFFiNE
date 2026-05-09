/* eslint-disable rxjs/finnish */
import { type CopilotChatHistoryFragment } from '@affine/graphql';
import { describe, expect, test, vi } from 'vitest';

import {
  canCreateNewDocPanelSession,
  filterDocPanelTabs,
  getChatContentKey,
  hasSessionMessages,
  isSessionAvailableInDocPanel,
  resolveInitialSession,
  type SessionService,
  shouldResetChatPanelOnUserInfoChange,
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

describe('getChatContentKey', () => {
  const cases = [
    {
      name: 'uses doc id before a session is created',
      input: {
        docId: 'doc-1',
        hasPinned: false,
        session: null,
      },
      expected: 'doc-1',
    },
    {
      name: 'keeps a new empty doc session on the doc key',
      input: {
        docId: 'doc-2',
        hasPinned: false,
        previousSessionDocId: 'doc-1',
        previousSessionId: 'session-1',
        session: {
          sessionId: 'session-2',
          docId: 'doc-2',
          messages: [],
        },
      },
      expected: 'doc-2',
    },
    {
      name: 'uses session id for a session with history',
      input: {
        docId: 'doc-1',
        hasPinned: false,
        session: {
          sessionId: 'session-1',
          docId: 'doc-1',
          messages: [{ id: 'message-1' }],
        },
      },
      expected: 'session-1',
    },
    {
      name: 'uses session id for a pinned session',
      input: {
        docId: 'doc-1',
        hasPinned: true,
        session: {
          sessionId: 'session-1',
          docId: 'doc-1',
          messages: [],
        },
      },
      expected: 'session-1',
    },
    {
      name: 'uses session id for same-doc session switch',
      input: {
        docId: 'doc-1',
        hasPinned: false,
        previousSessionDocId: 'doc-1',
        previousSessionId: 'session-1',
        session: {
          sessionId: 'session-2',
          docId: 'doc-1',
          messages: [],
        },
      },
      expected: 'session-2',
    },
    {
      name: 'keeps generating draft session on the doc key',
      input: {
        docId: 'doc-1',
        hasPinned: false,
        isGenerating: true,
        previousSessionDocId: 'doc-1',
        previousSessionId: 'session-1',
        session: {
          sessionId: 'session-2',
          docId: 'doc-1',
          messages: [],
        },
      },
      expected: 'doc-1',
    },
  ] satisfies {
    name: string;
    input: Parameters<typeof getChatContentKey>[0];
    expected: string;
  }[];

  test.each(cases)('$name', ({ input, expected }) => {
    expect(getChatContentKey(input)).toBe(expected);
  });
});

describe('shouldResetChatPanelOnUserInfoChange', () => {
  const cases = [
    {
      name: 'ignores the initial user info emission',
      input: {
        previousUserId: undefined,
        nextUserId: 'user-1',
      },
      expected: false,
    },
    {
      name: 'ignores same-user refreshes',
      input: {
        previousUserId: 'user-1',
        nextUserId: 'user-1',
      },
      expected: false,
    },
    {
      name: 'resets when the effective user changes',
      input: {
        previousUserId: 'user-1',
        nextUserId: 'user-2',
      },
      expected: true,
    },
    {
      name: 'resets when the effective user signs out',
      input: {
        previousUserId: 'user-1',
        nextUserId: null,
      },
      expected: true,
    },
  ] satisfies {
    name: string;
    input: Parameters<typeof shouldResetChatPanelOnUserInfoChange>[0];
    expected: boolean;
  }[];

  test.each(cases)('$name', ({ input, expected }) => {
    expect(shouldResetChatPanelOnUserInfoChange(input)).toBe(expected);
  });
});

describe('doc panel tabs', () => {
  const sessions = [
    { sessionId: 'current-doc-session', docId: 'doc-1' },
    { sessionId: 'workspace-session', docId: null },
    { sessionId: 'other-doc-session', docId: 'doc-2' },
  ];

  test('allows only current doc or workspace sessions', () => {
    expect(filterDocPanelTabs(sessions, 'doc-1')).toEqual([
      sessions[0],
      sessions[1],
    ]);
  });

  test('rejects other document sessions', () => {
    expect(isSessionAvailableInDocPanel(sessions[2], 'doc-1')).toBe(false);
  });
});

describe('new session guard', () => {
  test('allows a new session only after the current chat has messages', () => {
    expect(
      canCreateNewDocPanelSession({
        hasContextMessages: false,
        session: { messages: [] },
        status: 'idle',
      })
    ).toBe(false);
    expect(
      canCreateNewDocPanelSession({
        hasContextMessages: true,
        session: { messages: [] },
        status: 'idle',
      })
    ).toBe(true);
    expect(hasSessionMessages({ messages: [{ id: 'message-1' }] })).toBe(true);
  });

  test('does not allow a new session while generating', () => {
    expect(
      canCreateNewDocPanelSession({
        hasContextMessages: true,
        session: null,
        status: 'loading',
      })
    ).toBe(false);
  });
});

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
  test('prefers pinned session and clears sessionId from url', async () => {
    const pinnedSession = {
      sessionId: 'pinned-session',
      pinned: true,
    } as CopilotChatHistoryFragment;

    const sessionService: SessionService = {
      getSessions: vi.fn().mockResolvedValueOnce([pinnedSession]),
      getSession: vi.fn(),
    };

    const { workbench, updateQueryString } = createWorkbench(
      '?sessionId=from-url'
    );

    const result = await resolveInitialSession({
      sessionService,
      doc,
      workbench,
    });

    expect(result).toBe(pinnedSession);
    expect(updateQueryString).toHaveBeenCalledWith(
      { sessionId: undefined },
      { replace: true }
    );
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
});
