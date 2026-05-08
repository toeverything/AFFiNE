/* eslint-disable rxjs/finnish */
import type { CopilotChatHistoryFragment } from '@affine/graphql';

type SessionListOptions = {
  pinned?: boolean;
  action?: boolean;
  fork?: boolean;
  limit?: number;
};

export interface SessionService {
  getSessions: (
    workspaceId: string,
    docId?: string,
    options?: SessionListOptions
  ) => Promise<CopilotChatHistoryFragment[] | null | undefined>;
  getSession: (
    workspaceId: string,
    sessionId: string
  ) => Promise<CopilotChatHistoryFragment | null | undefined>;
}

export interface WorkbenchLike {
  location$: {
    value: {
      search: string;
    };
  };
  activeView$: {
    value: {
      updateQueryString: (
        patch: Record<string, unknown>,
        options?: { replace?: boolean }
      ) => void;
    };
  };
}

export interface DocLike {
  id: string;
  workspace: {
    id: string;
  };
}

interface ChatContentKeySession {
  sessionId?: string | null;
  docId?: string | null;
  messages?: readonly unknown[] | null;
}

export const shouldResetChatPanelOnUserInfoChange = ({
  previousUserId,
  nextUserId,
}: {
  previousUserId?: string | null;
  nextUserId?: string | null;
}) => {
  return previousUserId !== undefined && previousUserId !== nextUserId;
};

export const getChatContentKey = ({
  docId,
  hasPinned,
  previousSessionDocId,
  previousSessionId,
  session,
}: {
  docId?: string | null;
  hasPinned: boolean;
  previousSessionDocId?: string | null;
  previousSessionId?: string | null;
  session?: ChatContentKeySession | null;
}) => {
  const fallbackKey = docId ?? 'chat-panel';
  const sessionId = session?.sessionId;
  if (!sessionId) {
    return fallbackKey;
  }

  const sessionDocId = session.docId ?? docId ?? null;
  const hasSessionHistory = !!session.messages?.length;
  const sessionSwitchedWithinDoc = !!(
    previousSessionId &&
    previousSessionId !== sessionId &&
    previousSessionDocId &&
    sessionDocId &&
    previousSessionDocId === sessionDocId &&
    sessionDocId === docId
  );

  return hasPinned || hasSessionHistory || sessionSwitchedWithinDoc
    ? sessionId
    : fallbackKey;
};

export const getSessionIdFromUrl = (workbench?: WorkbenchLike | null) => {
  if (!workbench) {
    return undefined;
  }
  const searchParams = new URLSearchParams(workbench.location$.value.search);
  const sessionId = searchParams.get('sessionId');
  if (sessionId) {
    workbench.activeView$.value.updateQueryString(
      { sessionId: undefined },
      { replace: true }
    );
  }
  return sessionId ?? undefined;
};

export const resolveInitialSession = async ({
  sessionService,
  doc,
  workbench,
}: {
  sessionService?: SessionService | null;
  doc?: DocLike | null;
  workbench?: WorkbenchLike | null;
}): Promise<CopilotChatHistoryFragment | null | undefined> => {
  if (!sessionService || !doc) {
    return undefined;
  }

  const sessionId = getSessionIdFromUrl(workbench);

  const pinSessions = await sessionService.getSessions(
    doc.workspace.id,
    undefined,
    {
      pinned: true,
      limit: 1,
    }
  );

  if (Array.isArray(pinSessions) && pinSessions[0]) {
    return pinSessions[0];
  }

  if (sessionId) {
    const session = await sessionService.getSession(
      doc.workspace.id,
      sessionId
    );
    return session ?? null;
  }

  const docSessions = await sessionService.getSessions(
    doc.workspace.id,
    doc.id,
    {
      action: false,
      fork: false,
      limit: 1,
    }
  );

  return docSessions?.[0] ?? null;
};
