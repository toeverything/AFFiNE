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
  preferredSessionId,
}: {
  sessionService?: SessionService | null;
  doc?: DocLike | null;
  workbench?: WorkbenchLike | null;
  preferredSessionId?: string;
}): Promise<CopilotChatHistoryFragment | null | undefined> => {
  if (!sessionService || !doc) {
    return undefined;
  }

  const sessionId = getSessionIdFromUrl(workbench);

  const getSessionSafely = async (targetSessionId: string) => {
    try {
      return (
        (await sessionService.getSession(doc.workspace.id, targetSessionId)) ??
        null
      );
    } catch {
      return null;
    }
  };

  if (sessionId) {
    return getSessionSafely(sessionId);
  }

  if (preferredSessionId) {
    return getSessionSafely(preferredSessionId);
  }

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
