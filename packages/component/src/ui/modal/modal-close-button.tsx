import { CloseIcon } from '@blocksuite/icons';
import {
  IconButton,
  type IconButtonProps,
} from '@toeverything/components/button';
import type { HTMLAttributes } from 'react';

export type ModalCloseButtonProps = {
  top?: number;
  right?: number;
  absolute?: boolean;
} & Omit<IconButtonProps, 'children'> &
  HTMLAttributes<HTMLButtonElement>;

export const ModalCloseButton = ({
  absolute = true,
  right,
  top,
  ...props
}: ModalCloseButtonProps) => {
  return (
    <IconButton
      style={
        absolute
          ? {
              position: 'absolute',
              top: top ?? 24,
              right: right ?? 40,
              zIndex: 1,
            }
          : {}
      }
      data-testid="modal-close-button"
      {...props}
    >
      <CloseIcon />
    </IconButton>
  );
};

export default ModalCloseButton;
