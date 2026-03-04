import type { I18nInstance } from '@affine/i18n';
import type { NotificationService } from '@blocksuite/affine/shared/services';

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
