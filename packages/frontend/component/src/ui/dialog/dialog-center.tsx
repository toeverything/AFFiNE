import { useLiveData } from '@toeverything/infra';

import { Modal } from '../modal';
import { dialog } from './dialog';
import { dialogs$ } from './state';
import type { Dialog } from './types';

export const DialogCenter = () => {
  const dialogs = useLiveData(dialogs$);

  const onOpenChange = (info: Dialog, open: boolean) => {
    info.onOpenChange?.(open);
    if (!open) {
      dialog.close(info.id);
    }
  };

  return Object.entries(dialogs).map(([id, info]) => {
    return (
      <Modal key={id} onOpenChange={v => onOpenChange(info, v)} {...info}>
        {info.component}
      </Modal>
    );
  });
};
