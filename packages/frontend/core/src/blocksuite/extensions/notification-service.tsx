import {
  Input,
  type Notification,
  notify,
  toast,
  type ToastOptions,
  toReactNode,
  type useConfirmModal,
} from '@affine/component';
import { NotificationExtension } from '@blocksuite/affine/shared/services';

export function patchNotificationService({
  closeConfirmModal,
  openConfirmModal,
}: ReturnType<typeof useConfirmModal>) {
  return NotificationExtension({
    confirm: async ({ title, message, confirmText, cancelText, abort }) => {
      return new Promise<boolean>(resolve => {
        openConfirmModal({
          title: toReactNode(title),
          description: toReactNode(message),
          confirmText,
          confirmButtonOptions: {
            variant: 'primary',
          },
          cancelText,
          onConfirm: () => {
            resolve(true);
          },
          onCancel: () => {
            resolve(false);
          },
        });
        abort?.addEventListener('abort', () => {
          resolve(false);
          closeConfirmModal();
        });
      });
    },
    prompt: async ({
      title,
      message,
      confirmText,
      placeholder,
      cancelText,
      autofill,
      abort,
    }) => {
      return new Promise<string | null>(resolve => {
        let value = autofill || '';
        const description = (
          <div>
            <span style={{ marginBottom: 12 }}>{toReactNode(message)}</span>
            <Input
              autoSelect={true}
              placeholder={placeholder}
              defaultValue={value}
              onChange={e => (value = e)}
            />
          </div>
        );
        openConfirmModal({
          title: toReactNode(title),
          description: description,
          confirmText: confirmText ?? 'Confirm',
          confirmButtonOptions: {
            variant: 'primary',
          },
          cancelText: cancelText ?? 'Cancel',
          onConfirm: () => {
            resolve(value);
          },
          onCancel: () => {
            resolve(null);
          },
          autoFocusConfirm: false,
        });
        abort?.addEventListener('abort', () => {
          resolve(null);
          closeConfirmModal();
        });
      });
    },
    toast: (message: string, options: ToastOptions) => {
      return toast(message, options);
    },
    notify: notification => {
      const accentToNotify = {
        error: notify.error,
        success: notify.success,
        warning: notify.warning,
        info: notify,
      };

      const fn = accentToNotify[notification.accent || 'info'];
      if (!fn) {
        throw new Error('Invalid notification accent');
      }

      const toAffineNotificationActions = (
        actions: (typeof notification)['actions']
      ): Notification['actions'] => {
        if (!actions) return undefined;

        return actions.map(({ label, onClick, key }) => {
          return {
            key,
            label: toReactNode(label),
            onClick,
          };
        });
      };

      const toastId = fn(
        {
          title: toReactNode(notification.title),
          message: toReactNode(notification.message),
          actions: toAffineNotificationActions(notification.actions),
          onDismiss: notification.onClose,
        },
        {
          duration: notification.duration || 0,
          onDismiss: notification.onClose,
          onAutoClose: notification.onClose,
        }
      );

      notification.abort?.addEventListener('abort', () => {
        notify.dismiss(toastId);
      });
    },
  });
}
