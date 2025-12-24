import { createIdentifier, type ServiceProvider } from '@blocksuite/global/di';
import { EditorLifeCycleExtension } from '@blocksuite/std';
import { type ExtensionType, StoreIdentifier } from '@blocksuite/store';
import type { TemplateResult } from 'lit';

export interface NotificationService {
  toast(
    message: string,
    options?: {
      duration?: number;
      portal?: HTMLElement;
    }
  ): void;
  confirm(options: {
    title: string | TemplateResult;
    message: string | TemplateResult;
    confirmText?: string;
    cancelText?: string;
    abort?: AbortSignal;
  }): Promise<boolean>;
  prompt(options: {
    title: string | TemplateResult;
    message: string | TemplateResult;
    autofill?: string;
    placeholder?: string;
    confirmText?: string;
    cancelText?: string;
    abort?: AbortSignal;
  }): Promise<string | null>; // when cancel, return null
  notify(options: {
    title: string | TemplateResult;
    message?: string | TemplateResult;
    accent?: 'info' | 'success' | 'warning' | 'error';
    duration?: number; // unit ms, give 0 to disable auto dismiss
    abort?: AbortSignal;
    actions?: {
      key: string;
      label: string | TemplateResult;
      onClick: () => void;
    }[];
    onClose?: () => void;
  }): void;
  /**
   * Notify with undo action, it is a helper function to notify with undo action.
   * And the notification card will be closed when undo action is triggered by shortcut key or other ways.
   */
  notifyWithUndoAction: (
    options: Parameters<NotificationService['notify']>[0]
  ) => void;
}

export const NotificationProvider = createIdentifier<NotificationService>(
  'AffineNotificationService'
);

export function NotificationExtension(
  notificationService: NotificationService
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(NotificationProvider, provider => {
        return {
          notify: notificationService.notify,
          toast: notificationService.toast,
          confirm: notificationService.confirm,
          prompt: notificationService.prompt,
          notifyWithUndoAction: options => {
            notifyWithUndoActionImpl(
              provider,
              notificationService.notify,
              options
            );
          },
        };
      });
    },
  };
}

function notifyWithUndoActionImpl(
  provider: ServiceProvider,
  notify: NotificationService['notify'],
  options: Parameters<NotificationService['notifyWithUndoAction']>[0]
) {
  const store = provider.get(StoreIdentifier);

  const abortController = new AbortController();
  const abort = () => {
    abortController.abort();
  };
  options.abort?.addEventListener('abort', abort);

  const clearOnClose = () => {
    store.history.undoManager.off('stack-item-added', addHandler);
    store.history.undoManager.off('stack-item-popped', popHandler);
    disposable.unsubscribe();
    options.abort?.removeEventListener('abort', abort);
  };

  const addHandler = store.history.undoManager.on('stack-item-added', abort);
  const popHandler = store.history.undoManager.on('stack-item-popped', abort);
  const disposable = provider
    .get(EditorLifeCycleExtension)
    .slots.unmounted.subscribe(() => abort());

  notify({
    ...options,
    actions: [
      {
        key: 'notification-card-undo',
        label: 'Undo',
        onClick: () => {
          store.undo();
          abortController.abort();
        },
      },
      ...(options.actions ?? []),
    ],
    abort: abortController.signal,
    onClose: () => {
      options.onClose?.();
      clearOnClose();
    },
  });
}
