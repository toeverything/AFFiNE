import { WorkspaceLocalState } from '@affine/core/modules/workspace';
import type { I18nInstance } from '@affine/i18n';
import type { NotificationService } from '@blocksuite/affine/shared/services';
import { useService } from '@toeverything/infra';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

const AI_CHAT_OPEN_TABS_KEY = 'aiChatOpenTabs';

// Pass `null` for `loadSession` to defer hydration until a real loader is ready.
export function useAIChatOpenTabs<T extends { sessionId: string }>(
  loadSession: ((sessionId: string) => Promise<T | null | undefined>) | null
): {
  openTabs: T[];
  setOpenTabs: Dispatch<SetStateAction<T[]>>;
} {
  const workspaceLocalState = useService(WorkspaceLocalState);
  const [openTabs, setOpenTabsState] = useState<T[]>([]);
  // Ref so persist gate isn't subject to React state-batch ordering.
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!loadSession) return;
    hydratedRef.current = false;
    setOpenTabsState([]);

    const ids = workspaceLocalState.get<string[]>(AI_CHAT_OPEN_TABS_KEY) ?? [];
    if (!ids.length) {
      hydratedRef.current = true;
      return;
    }

    let cancelled = false;
    Promise.all(ids.map(id => loadSession(id).catch(() => null)))
      .then(results => {
        if (cancelled) return;
        const valid = (results as (T | null | undefined)[]).filter(
          (entry): entry is T => !!entry && !!entry.sessionId
        );
        if (valid.length) setOpenTabsState(valid);
        hydratedRef.current = true;
      })
      .catch(error => {
        console.error(error);
        if (!cancelled) hydratedRef.current = true;
      });

    return () => {
      cancelled = true;
    };
  }, [loadSession, workspaceLocalState]);

  const setOpenTabs = useCallback<Dispatch<SetStateAction<T[]>>>(
    updater => {
      setOpenTabsState(prev => {
        const next =
          typeof updater === 'function'
            ? (updater as (p: T[]) => T[])(prev)
            : updater;
        if (hydratedRef.current) {
          if (next.length) {
            workspaceLocalState.set(
              AI_CHAT_OPEN_TABS_KEY,
              next.map(tab => tab.sessionId)
            );
          } else {
            workspaceLocalState.del(AI_CHAT_OPEN_TABS_KEY);
          }
        }
        return next;
      });
    },
    [workspaceLocalState]
  );

  return { openTabs, setOpenTabs };
}

export type SessionDeleteCleanupFn = (
  session: BlockSuitePresets.AIRecentSession
) => Promise<void>;

export type CreateSessionDeleteHandlerOptions = {
  t: I18nInstance;
  notificationService: NotificationService;
  cleanupSession: SessionDeleteCleanupFn;
  canDeleteSession?: (session: BlockSuitePresets.AIRecentSession) => boolean;
  isActiveSession?: (session: BlockSuitePresets.AIRecentSession) => boolean;
  onActiveSessionDeleted?: () => void;
};

export function createSessionDeleteHandler({
  t,
  notificationService,
  cleanupSession,
  canDeleteSession,
  isActiveSession,
  onActiveSessionDeleted,
}: CreateSessionDeleteHandlerOptions) {
  return async (sessionToDelete: BlockSuitePresets.AIRecentSession) => {
    if (canDeleteSession && !canDeleteSession(sessionToDelete)) {
      notificationService.toast(
        t['com.affine.ai.chat-panel.session.delete.toast.failed']()
      );
      return;
    }

    const confirm = await notificationService.confirm({
      title: t['com.affine.ai.chat-panel.session.delete.confirm.title'](),
      message: t['com.affine.ai.chat-panel.session.delete.confirm.message'](),
      confirmText: t['Delete'](),
      cancelText: t['Cancel'](),
    });

    if (!confirm) {
      return;
    }

    try {
      await cleanupSession(sessionToDelete);
      notificationService.toast(
        t['com.affine.ai.chat-panel.session.delete.toast.success']()
      );
    } catch (error) {
      console.error(error);
      notificationService.toast(
        t['com.affine.ai.chat-panel.session.delete.toast.failed']()
      );
      return;
    }

    if (isActiveSession?.(sessionToDelete)) {
      onActiveSessionDeleted?.();
    }
  };
}
