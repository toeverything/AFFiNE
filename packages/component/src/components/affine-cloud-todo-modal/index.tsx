import * as AlertDialog from '@radix-ui/react-alert-dialog';
import type { PropsWithChildren, ReactElement } from 'react';

import { dialogContentStyle, dialogOverlayStyle } from './index.css';

export const AffineCloudTodoModal = (
  props: PropsWithChildren
): ReactElement => {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger>{props.children}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={dialogOverlayStyle} />
        <AlertDialog.Content className={dialogContentStyle}>
          <AlertDialog.Title>AFFiNE Cloud</AlertDialog.Title>
          <AlertDialog.Description>AFFINE</AlertDialog.Description>
          <div style={{ display: 'flex', gap: 25, justifyContent: 'flex-end' }}>
            <AlertDialog.Cancel asChild>
              <button>Cancel</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button>Ok</button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
};
