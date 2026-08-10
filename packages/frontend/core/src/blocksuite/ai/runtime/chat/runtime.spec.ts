/**
 * @vitest-environment happy-dom
 */
import type { CopilotChatHistoryFragment } from '@affine/graphql';
import { describe, expect, test, vi } from 'vitest';

import { SelectedSourcesProcessingError } from '../../provider/error';
import type { AIRequestService } from '../request';
import { AIChatRuntime } from './runtime';
import {
  DocAIChatSessionStrategy,
  ForkAIChatSessionStrategy,
  PlaygroundAIChatSessionStrategy,
} from './session-strategy';
import type { AIChatScope } from './state';

const docScope: AIChatScope = {
  kind: 'doc',
  workspaceId: 'workspace-1',
  docId: 'doc-1',
};

function session(
  overrides: Partial<CopilotChatHistoryFragment> = {}
): CopilotChatHistoryFragment {
  return {
    sessionId: 'session-1',
    workspaceId: 'workspace-1',
    docId: 'doc-1',
    title: 'Session 1',
    pinned: false,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    parentSessionId: null,
    promptName: 'Chat With AFFiNE AI',
    action: null,
    ...overrides,
  } as CopilotChatHistoryFragment;
}

async function* stream(chunks: string[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function waitUntil(assertion: () => void) {
  for (let i = 0; i < 10; i++) {
    try {
      assertion();
      return;
    } catch {
      await Promise.resolve();
    }
  }
  assertion();
}

function createRequest(
  overrides: Partial<AIRequestService> = {}
): AIRequestService {
  return {
    getSessions: vi.fn().mockResolvedValue([]),
    getRecentSessions: vi.fn().mockResolvedValue([]),
    getSession: vi.fn().mockResolvedValue(null),
    createSessionWithHistory: vi.fn().mockResolvedValue(session()),
    updateSession: vi.fn().mockResolvedValue(undefined),
    cleanupSessions: vi.fn().mockResolvedValue(undefined),
    getActiveEditorContext: vi.fn().mockReturnValue(undefined),
    executeAction: vi.fn().mockResolvedValue(stream(['hello'])),
    waitForSelectedSources: vi.fn().mockResolvedValue(undefined),
    histories: {
      ids: vi.fn().mockResolvedValue([]),
    },
    ...overrides,
  } as unknown as AIRequestService;
}

function createRuntime(request = createRequest()) {
  return new AIChatRuntime({
    request,
    scope: docScope,
    strategy: new DocAIChatSessionStrategy(),
  });
}

describe('AIChatRuntime', () => {
  test('initializes doc scope with a draft tab when no session exists', async () => {
    const runtime = createRuntime();

    await runtime.dispatch({ type: 'initialize' });

    const snapshot = runtime.getSnapshot();
    expect(snapshot.readiness).toBe('ready');
    expect(snapshot.activeSessionId).toBeNull();
    expect(snapshot.tabs).toEqual([
      expect.objectContaining({ kind: 'draft', hasMessages: false }),
    ]);
    expect(snapshot.uiPolicy.showDraftTab).toBe(true);
  });

  test('initializes doc scope with full messages for the latest session', async () => {
    const listedSession = session({ sessionId: 'session-1', messages: [] });
    const fullSession = session({
      sessionId: 'session-1',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: 'previous chat',
          scopeSnapshot: null,
          attachments: [],
          streamObjects: [],
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const request = createRequest({
      getSessions: vi
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([listedSession]),
      getSession: vi.fn().mockResolvedValue(fullSession),
    });
    const runtime = createRuntime(request);

    await runtime.dispatch({ type: 'initialize' });

    expect(request.getSession).toHaveBeenCalledWith('workspace-1', 'session-1');
    expect(runtime.getSnapshot().messages).toEqual(fullSession.messages);
  });

  test('send tolerates optional editor activation and ignores duplicate sends while transmitting', async () => {
    let release!: () => void;
    const blockedStream = {
      async *[Symbol.asyncIterator]() {
        await new Promise<void>(resolve => {
          release = resolve;
        });
        yield 'done';
      },
    };
    const request = createRequest({
      getActiveEditorContext: vi.fn().mockReturnValue('{"mode":"page"}'),
      executeAction: vi.fn().mockResolvedValue(blockedStream),
    });
    const runtime = createRuntime(request);
    await runtime.dispatch({ type: 'initialize' });

    const firstSend = runtime.dispatch({ type: 'send', input: 'hello' });
    await waitUntil(() => {
      expect(request.executeAction).toHaveBeenCalled();
    });
    await runtime.dispatch({ type: 'send', input: 'again' });
    release();
    await firstSend;

    expect(request.createSessionWithHistory).toHaveBeenCalledTimes(1);
    expect(request.executeAction).toHaveBeenCalledTimes(1);
    expect(request.executeAction).toHaveBeenCalledWith(
      'chat',
      expect.objectContaining({ liveEditorContext: '{"mode":"page"}' })
    );
    expect(runtime.getSnapshot().messages.at(-1)?.content).toBe('done');
    expect(runtime.getSnapshot().uiPolicy.canCreateNewSession).toBe(true);

    const activationError = new Error('editor unavailable');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const fallbackRequest = createRequest({
      activateEditor: vi.fn().mockRejectedValue(activationError),
      getActiveEditorContext: vi.fn().mockReturnValue('stale context'),
      executeAction: vi.fn().mockResolvedValue(stream(['fallback'])),
    });
    const fallbackRuntime = createRuntime(fallbackRequest);
    await fallbackRuntime.dispatch({ type: 'initialize' });

    await fallbackRuntime.dispatch({ type: 'send', input: 'hello' });

    expect(consoleError).toHaveBeenCalledWith(activationError);
    expect(fallbackRequest.executeAction).toHaveBeenCalledWith(
      'chat',
      expect.objectContaining({ liveEditorContext: undefined })
    );
    expect(fallbackRuntime.getSnapshot().messages.at(-1)?.content).toBe(
      'fallback'
    );
    expect(fallbackRuntime.getSnapshot().status).toBe('success');
    consoleError.mockRestore();
  });

  test('send binds an unbound session to the active doc after success', async () => {
    const unboundSession = session({ docId: null });
    const boundSession = session({ docId: 'doc-1' });
    const request = createRequest({
      getSession: vi.fn().mockResolvedValue(boundSession),
    });
    const runtime = createRuntime(request);
    await runtime.dispatch({
      type: 'openSessionObject',
      session: unboundSession,
    });

    await runtime.dispatch({ type: 'send', input: 'hello' });

    expect(request.updateSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      docId: 'doc-1',
    });
    expect(request.getSession).toHaveBeenCalledWith('workspace-1', 'session-1');
    expect(runtime.getSnapshot().sessions[0].docId).toBe('doc-1');
  });

  test('new session opens a draft tab and persists on first send', async () => {
    const request = createRequest({
      createSessionWithHistory: vi
        .fn()
        .mockResolvedValue(session({ sessionId: 'session-2', messages: [] })),
    });
    const runtime = createRuntime(request);
    await runtime.dispatch({
      type: 'openSessionObject',
      session: session({
        sessionId: 'session-1',
        title: 'One',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'existing chat',
            scopeSnapshot: null,
            attachments: [],
            streamObjects: [],
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });

    await runtime.dispatch({ type: 'createNewSession' });

    expect(request.createSessionWithHistory).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().activeSessionId).toBeNull();
    expect(runtime.getSnapshot().messages).toEqual([]);
    expect(runtime.getSnapshot().uiPolicy.showDraftTab).toBe(true);
    expect(runtime.getSnapshot().tabs).toEqual([
      expect.objectContaining({ kind: 'session', sessionId: 'session-1' }),
      expect.objectContaining({ kind: 'draft' }),
    ]);

    await runtime.dispatch({ type: 'send', input: 'hello' });

    expect(request.createSessionWithHistory).toHaveBeenCalledTimes(1);
    expect(runtime.getSnapshot().activeSessionId).toBe('session-2');
    expect(runtime.getSnapshot().uiPolicy.showDraftTab).toBe(false);
    expect(runtime.getSnapshot().tabs).toEqual([
      expect.objectContaining({ kind: 'session', sessionId: 'session-1' }),
      expect.objectContaining({ kind: 'session', sessionId: 'session-2' }),
    ]);
  });

  test('toggle pin updates tab and session snapshots', async () => {
    const request = createRequest();
    const runtime = createRuntime(request);
    await runtime.dispatch({
      type: 'openSessionObject',
      session: session({ pinned: false }),
    });

    await runtime.dispatch({ type: 'togglePinActiveSession' });

    expect(request.updateSession).toHaveBeenCalledWith({
      sessionId: 'session-1',
      pinned: true,
    });
    expect(runtime.getSnapshot().tabs[0]).toEqual(
      expect.objectContaining({ pinned: true })
    );
    expect(runtime.getSnapshot().sessions[0]).toEqual(
      expect.objectContaining({ pinned: true })
    );
  });

  test('new session inserts the draft tab after the active tab', async () => {
    const runtime = createRuntime();
    await runtime.dispatch({
      type: 'openSessionObject',
      session: session({
        sessionId: 'session-1',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'first chat',
            scopeSnapshot: null,
            attachments: [],
            streamObjects: [],
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
    await runtime.dispatch({
      type: 'openSessionObject',
      session: session({
        sessionId: 'session-2',
        messages: [
          {
            id: 'message-2',
            role: 'user',
            content: 'second chat',
            scopeSnapshot: null,
            attachments: [],
            streamObjects: [],
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
    await runtime.dispatch({
      type: 'openSessionObject',
      session: session({
        sessionId: 'session-1',
        messages: [
          {
            id: 'message-1',
            role: 'user',
            content: 'first chat',
            scopeSnapshot: null,
            attachments: [],
            streamObjects: [],
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });

    await runtime.dispatch({ type: 'createNewSession' });

    expect(runtime.getSnapshot().tabs.map(tab => tab.kind)).toEqual([
      'session',
      'draft',
      'session',
    ]);
    expect(runtime.getSnapshot().tabs.map(tab => tab.id)).toEqual([
      'session-1',
      expect.stringContaining('draft:'),
      'session-2',
    ]);
  });

  test('close active tab falls back to the previous session tab', async () => {
    const runtime = createRuntime();
    await runtime.dispatch({
      type: 'openSessionObject',
      session: session({ sessionId: 'session-1', title: 'One' }),
    });
    await runtime.dispatch({
      type: 'openSessionObject',
      session: session({ sessionId: 'session-2', title: 'Two' }),
    });

    await runtime.dispatch({ type: 'closeTab', tabId: 'session-2' });

    expect(runtime.getSnapshot().activeSessionId).toBe('session-1');
  });

  test('close active tab reloads fallback session messages', async () => {
    const fallbackSession = session({
      sessionId: 'session-1',
      title: 'One',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: 'old chat',
          scopeSnapshot: null,
          attachments: [],
          streamObjects: [],
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const request = createRequest({
      getSession: vi.fn().mockResolvedValue(fallbackSession),
    });
    const runtime = createRuntime(request);
    await runtime.dispatch({
      type: 'openSessionObject',
      session: session({ sessionId: 'session-1', title: 'One', messages: [] }),
    });
    await runtime.dispatch({
      type: 'openSessionObject',
      session: session({ sessionId: 'session-2', title: 'Two', messages: [] }),
    });

    await runtime.dispatch({ type: 'closeTab', tabId: 'session-2' });

    expect(request.getSession).toHaveBeenCalledWith('workspace-1', 'session-1');
    expect(runtime.getSnapshot().activeSessionId).toBe('session-1');
    expect(runtime.getSnapshot().messages).toEqual(fallbackSession.messages);
  });

  test('refreshHistory keeps current doc sessions separate from recent sessions', async () => {
    const currentDoc = [session({ sessionId: 'doc-session' })];
    const recent = [session({ sessionId: 'recent-session', docId: null })];
    const request = createRequest({
      getSessions: vi.fn().mockResolvedValue(currentDoc),
      getRecentSessions: vi.fn().mockResolvedValue(recent),
    });
    const runtime = createRuntime(request);

    await runtime.dispatch({ type: 'refreshHistory' });

    expect(runtime.getSnapshot().history.currentDoc).toEqual(currentDoc);
    expect(runtime.getSnapshot().history.recent).toEqual(recent);
  });

  test('other-doc session returns a navigation request instead of opening a tab', async () => {
    const runtime = createRuntime();

    await runtime.dispatch({
      type: 'openSessionObject',
      session: session({ sessionId: 'session-2', docId: 'doc-2' }),
    });

    expect(runtime.getSnapshot().navigationRequest).toEqual({
      workspaceId: 'workspace-1',
      docId: 'doc-2',
      sessionId: 'session-2',
      resetTabs: true,
    });
    expect(runtime.getSnapshot().activeSessionId).toBeNull();
  });

  test('stale stream result does not commit after scope switch', async () => {
    let release!: () => void;
    const delayedStream = {
      async *[Symbol.asyncIterator]() {
        await new Promise<void>(resolve => {
          release = resolve;
        });
        yield 'late';
      },
    };
    const request = createRequest({
      executeAction: vi.fn().mockResolvedValue(delayedStream),
    });
    const runtime = createRuntime(request);
    await runtime.dispatch({ type: 'initialize' });
    const send = runtime.dispatch({ type: 'send', input: 'hello' });
    await waitUntil(() => {
      expect(request.executeAction).toHaveBeenCalled();
    });

    await runtime.dispatch({
      type: 'setScope',
      scope: { kind: 'doc', workspaceId: 'workspace-1', docId: 'doc-2' },
    });
    release();
    await send;

    expect(runtime.getSnapshot().scope).toEqual({
      kind: 'doc',
      workspaceId: 'workspace-1',
      docId: 'doc-2',
    });
    expect(runtime.getSnapshot().messages).toEqual([]);
  });

  test('stale session creation does not open after scope switch', async () => {
    let releaseSession!: (value: CopilotChatHistoryFragment) => void;
    const request = createRequest({
      createSessionWithHistory: vi.fn().mockReturnValue(
        new Promise<CopilotChatHistoryFragment>(resolve => {
          releaseSession = resolve;
        })
      ),
    });
    const runtime = createRuntime(request);
    await runtime.dispatch({ type: 'initialize' });

    const send = runtime.dispatch({ type: 'send', input: 'hello' });
    await runtime.dispatch({
      type: 'setScope',
      scope: { kind: 'doc', workspaceId: 'workspace-1', docId: 'doc-2' },
    });
    releaseSession(session({ sessionId: 'late-session' }));
    await send;

    expect(runtime.getSnapshot().activeSessionId).toBeNull();
    expect(runtime.getSnapshot().sessions).toEqual([]);
  });

  test('send failure commits error status without throwing', async () => {
    const error = new Error('network failed');
    const request = createRequest({
      executeAction: vi.fn().mockRejectedValue(error),
    });
    const runtime = createRuntime(request);
    await runtime.dispatch({ type: 'initialize' });

    await runtime.dispatch({ type: 'send', input: 'hello' });

    expect(runtime.getSnapshot().status).toBe('error');
    expect(runtime.getSnapshot().error).toBe(error);
    expect(runtime.getSnapshot().messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({ role: 'assistant', content: '' }),
    ]);
  });

  test('send remains successful when refreshing the assistant message id fails', async () => {
    const error = new Error('history unavailable');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const request = createRequest();
    (request.histories.ids as ReturnType<typeof vi.fn>).mockRejectedValue(
      error
    );
    const runtime = createRuntime(request);
    await runtime.dispatch({ type: 'initialize' });

    await runtime.dispatch({ type: 'send', input: 'hello' });

    expect(runtime.getSnapshot().status).toBe('success');
    expect(runtime.getSnapshot().error).toBeNull();
    expect(runtime.getSnapshot().messages.at(-1)).toEqual(
      expect.objectContaining({ role: 'assistant', content: 'hello' })
    );
    expect(consoleError).toHaveBeenCalledWith(error);
    consoleError.mockRestore();
  });

  test('stop marks the active assistant response as complete', async () => {
    let release!: () => void;
    const blockedStream = {
      async *[Symbol.asyncIterator]() {
        yield 'partial';
        await new Promise<void>(resolve => {
          release = resolve;
        });
        yield 'late';
      },
    };
    const request = createRequest({
      executeAction: vi.fn().mockResolvedValue(blockedStream),
    });
    const runtime = createRuntime(request);
    await runtime.dispatch({ type: 'initialize' });

    const send = runtime.dispatch({ type: 'send', input: 'hello' });
    await waitUntil(() => {
      expect(runtime.getSnapshot().status).toBe('transmitting');
    });

    await runtime.dispatch({ type: 'stop' });
    release();
    await send;

    expect(runtime.getSnapshot().status).toBe('success');
    expect(runtime.getSnapshot().messages.at(-1)).toEqual(
      expect.objectContaining({ role: 'assistant', content: 'partial' })
    );
  });

  test('clearError resets error status', async () => {
    const error = new Error('network failed');
    const runtime = createRuntime(
      createRequest({
        executeAction: vi.fn().mockRejectedValue(error),
      })
    );
    await runtime.dispatch({ type: 'initialize' });
    await runtime.dispatch({ type: 'send', input: 'hello' });

    await runtime.dispatch({ type: 'clearError' });

    expect(runtime.getSnapshot().status).toBe('idle');
    expect(runtime.getSnapshot().error).toBeNull();
  });

  test('retry failure commits error status and keeps the retried assistant placeholder', async () => {
    const error = new SelectedSourcesProcessingError('retry failed');
    const request = createRequest({
      executeAction: vi.fn().mockRejectedValue(error),
    });
    const runtime = createRuntime(request);
    await runtime.dispatch({
      type: 'openSessionObject',
      session: session({
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'hello',
            createdAt: new Date().toISOString(),
            scopeSnapshot: null,
            attachments: null,
            streamObjects: null,
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'old',
            createdAt: new Date().toISOString(),
            scopeSnapshot: null,
            attachments: null,
            streamObjects: null,
          },
        ],
      }),
    });

    await runtime.dispatch({ type: 'retry', messageId: 'assistant-1' });

    expect(runtime.getSnapshot().status).toBe('error');
    expect(runtime.getSnapshot().error).toBe(error);
    expect(runtime.getSnapshot().messages[1]).toEqual(
      expect.objectContaining({ role: 'assistant', content: '' })
    );
  });

  test('stale openSession result does not commit after scope switch', async () => {
    let release!: (value: CopilotChatHistoryFragment) => void;
    const request = createRequest({
      getSession: vi.fn().mockReturnValue(
        new Promise<CopilotChatHistoryFragment>(resolve => {
          release = resolve;
        })
      ),
    });
    const runtime = createRuntime(request);

    const open = runtime.dispatch({
      type: 'openSession',
      sessionId: 'session-2',
    });
    await runtime.dispatch({
      type: 'setScope',
      scope: { kind: 'doc', workspaceId: 'workspace-1', docId: 'doc-2' },
    });
    release(session({ sessionId: 'session-2' }));
    await open;

    expect(runtime.getSnapshot().scope).toEqual({
      kind: 'doc',
      workspaceId: 'workspace-1',
      docId: 'doc-2',
    });
    expect(runtime.getSnapshot().activeSessionId).toBeNull();
  });

  test('retry uses existing session and preserves user messages', async () => {
    const request = createRequest({
      executeAction: vi.fn().mockResolvedValue(stream(['retry'])),
    });
    const runtime = createRuntime(request);
    await runtime.dispatch({
      type: 'openSessionObject',
      session: session({
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'hello',
            createdAt: new Date().toISOString(),
            scopeSnapshot: null,
            attachments: null,
            streamObjects: null,
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'old',
            createdAt: new Date().toISOString(),
            scopeSnapshot: null,
            attachments: null,
            streamObjects: null,
          },
        ],
      }),
    });

    await runtime.dispatch({ type: 'retry', messageId: 'assistant-1' });

    expect(runtime.getSnapshot().messages[0].content).toBe('hello');
    expect(runtime.getSnapshot().messages[1].content).toBe('retry');
    expect(request.executeAction).toHaveBeenCalledWith(
      'chat',
      expect.objectContaining({ retry: true, sessionId: 'session-1' })
    );
  });

  test('retry remains successful when refreshing the assistant message id fails', async () => {
    const error = new Error('history unavailable');
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const request = createRequest({
      executeAction: vi.fn().mockResolvedValue(stream(['retry'])),
    });
    (request.histories.ids as ReturnType<typeof vi.fn>).mockRejectedValue(
      error
    );
    const runtime = createRuntime(request);
    await runtime.dispatch({
      type: 'openSessionObject',
      session: session({
        messages: [
          {
            id: 'user-1',
            role: 'user',
            content: 'hello',
            createdAt: new Date().toISOString(),
            scopeSnapshot: null,
            attachments: null,
            streamObjects: null,
          },
          {
            id: '',
            role: 'assistant',
            content: 'old',
            createdAt: new Date().toISOString(),
            scopeSnapshot: null,
            attachments: null,
            streamObjects: null,
          },
        ],
      }),
    });

    await runtime.dispatch({ type: 'retry', messageId: '' });

    expect(runtime.getSnapshot().status).toBe('success');
    expect(runtime.getSnapshot().error).toBeNull();
    expect(runtime.getSnapshot().messages[1]).toEqual(
      expect.objectContaining({ role: 'assistant', content: 'retry' })
    );
    expect(consoleError).toHaveBeenCalledWith(error);
    consoleError.mockRestore();
  });

  test('retry reuses failed initial messages when no session was created', async () => {
    const error = new Error('create session failed');
    const request = createRequest({
      createSessionWithHistory: vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValueOnce(session({ sessionId: 'session-2' })),
      executeAction: vi.fn().mockResolvedValue(stream(['retry'])),
    });
    const runtime = createRuntime(request);
    await runtime.dispatch({ type: 'initialize' });
    await runtime.dispatch({ type: 'send', input: 'hello' });

    expect(runtime.getSnapshot().activeSessionId).toBeNull();
    expect(runtime.getSnapshot().status).toBe('error');

    await runtime.dispatch({ type: 'retry', messageId: '' });

    expect(runtime.getSnapshot().activeSessionId).toBe('session-2');
    expect(runtime.getSnapshot().status).toBe('success');
    expect(runtime.getSnapshot().messages).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({ role: 'assistant', content: 'retry' }),
    ]);
  });

  test('history refresh does not stale an active stream', async () => {
    let release!: () => void;
    const delayedStream = {
      async *[Symbol.asyncIterator]() {
        await new Promise<void>(resolve => {
          release = resolve;
        });
        yield 'late';
      },
    };
    const request = createRequest({
      executeAction: vi.fn().mockResolvedValue(delayedStream),
      getRecentSessions: vi
        .fn()
        .mockResolvedValue([session({ sessionId: 'recent' })]),
    });
    const runtime = createRuntime(request);
    await runtime.dispatch({ type: 'initialize' });

    const send = runtime.dispatch({ type: 'send', input: 'hello' });
    await waitUntil(() => {
      expect(request.executeAction).toHaveBeenCalled();
    });
    await runtime.dispatch({ type: 'refreshHistory' });
    release();
    await send;

    expect(runtime.getSnapshot().messages.at(-1)?.content).toBe('late');
    expect(runtime.getSnapshot().history.recent[0].sessionId).toBe('recent');
  });

  test('selected sources stay local, synchronize before send, and clear after success', async () => {
    const request = createRequest();
    const runtime = createRuntime(request);
    const file = new File(['attachment'], 'attachment.txt', {
      type: 'text/plain',
    });
    const image = new File(['image'], 'image.png', { type: 'image/png' });
    await runtime.dispatch({ type: 'initialize' });
    await runtime.dispatch({
      type: 'addScopeSelector',
      item: { kind: 'doc', docId: 'doc-1' },
    });
    await runtime.dispatch({
      type: 'addScopeSelector',
      item: { kind: 'doc', docId: 'doc-2' },
    });
    await runtime.dispatch({
      type: 'removeScopeSelector',
      item: { kind: 'doc', docId: 'doc-1' },
    });
    await runtime.dispatch({
      type: 'addFocusSelector',
      item: { kind: 'tag', tagId: 'tag-1', docIds: [] },
    });
    await runtime.dispatch({
      type: 'addFocusSelector',
      item: { kind: 'tag', tagId: 'tag-2', docIds: ['doc-3'] },
    });
    await runtime.dispatch({
      type: 'removeFocusSelector',
      item: { kind: 'tag', tagId: 'tag-1', docIds: [] },
    });
    await runtime.dispatch({
      type: 'addScopeSelector',
      item: { kind: 'file', file },
    });

    await runtime.dispatch({
      type: 'send',
      input: 'question',
      attachments: [image],
    });

    expect(request.waitForSelectedSources).toHaveBeenCalledTimes(1);
    expect(request.waitForSelectedSources).toHaveBeenCalledWith([
      'doc-2',
      'doc-3',
    ]);
    expect(request.executeAction).toHaveBeenCalledWith(
      'chat',
      expect.objectContaining({
        scopeSelectors: [{ kind: 'document', id: 'doc-2' }],
        focusSelectors: [{ kind: 'tag', id: 'tag-2' }],
        attachments: [file, image],
      })
    );
    expect(runtime.getSnapshot().composer.scopeSelection.items).toEqual([]);
    expect(runtime.getSnapshot().composer.focus.items).toEqual([
      { kind: 'tag', tagId: 'tag-2', docIds: ['doc-3'] },
    ]);
  });

  test('selected source synchronization failure does not submit a message', async () => {
    const request = createRequest({
      waitForSelectedSources: vi.fn().mockRejectedValue(new Error('offline')),
    });
    const runtime = createRuntime(request);
    await runtime.dispatch({ type: 'initialize' });
    await runtime.dispatch({
      type: 'addScopeSelector',
      item: { kind: 'collection', collectionId: 'collection-1', docIds: [] },
    });

    await runtime.dispatch({ type: 'send', input: 'question' });

    expect(request.executeAction).not.toHaveBeenCalled();
    expect(runtime.getSnapshot().status).toBe('error');
    expect(runtime.getSnapshot().composer.scopeSelection.items).toHaveLength(1);
    expect(runtime.getSnapshot().composer.scopeSelection.error?.message).toBe(
      'offline'
    );
  });

  test('fork strategy creates child session from parent without doc tab restrictions', async () => {
    const request = createRequest({
      forkChat: vi.fn().mockResolvedValue('fork-session'),
      getSession: vi.fn().mockResolvedValue(
        session({
          sessionId: 'fork-session',
          docId: 'another-doc',
          parentSessionId: 'parent-session',
        })
      ),
    });
    const runtime = new AIChatRuntime({
      request,
      scope: {
        kind: 'fork',
        workspaceId: 'workspace-1',
        docId: 'doc-1',
        parentSessionId: 'parent-session',
        latestMessageId: 'message-1',
      },
      strategy: new ForkAIChatSessionStrategy(),
    });

    await runtime.dispatch({ type: 'send', input: 'hello' });

    expect(request.forkChat).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      docId: 'doc-1',
      sessionId: 'parent-session',
      latestMessageId: 'message-1',
    });
    expect(runtime.getSnapshot().navigationRequest).toBeNull();
    expect(runtime.getSnapshot().activeSessionId).toBe('fork-session');
  });

  test('playground strategy creates fork sessions from parent scope', async () => {
    const request = createRequest({
      forkChat: vi.fn().mockResolvedValue('playground-fork'),
      getSession: vi.fn().mockResolvedValue(
        session({
          sessionId: 'playground-fork',
          docId: 'doc-1',
          parentSessionId: 'root-session',
        })
      ),
    });
    const runtime = new AIChatRuntime({
      request,
      scope: {
        kind: 'playground',
        workspaceId: 'workspace-1',
        docId: 'doc-1',
        parentSessionId: 'root-session',
      },
      strategy: new PlaygroundAIChatSessionStrategy(),
    });

    const forkSession = await runtime.createSession();

    expect(request.forkChat).toHaveBeenCalledWith({
      workspaceId: 'workspace-1',
      docId: 'doc-1',
      sessionId: 'root-session',
    });
    expect(forkSession?.sessionId).toBe('playground-fork');
  });
});
