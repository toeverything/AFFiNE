import { CloseIcon } from '@blocksuite/icons';
import type { HTMLAttributes } from 'react';

import { styled } from '../../styles';
import type { IconButtonProps } from '../button/IconButton';
import { IconButton } from '../button/IconButton';
export type ModalCloseButtonProps = {
  top?: number;
  right?: number;
  absolute?: boolean;
} & Omit<IconButtonProps, 'children'> &
  HTMLAttributes<HTMLButtonElement>;

const StyledIconButton = styled(IconButton)<
  Pick<ModalCloseButtonProps, 'top' | 'right'>
>(({ top, right }) => {
  return {
    position: 'absolute',
    top: top ?? 24,
    right: right ?? 40,
  };
});

export const ModalCloseButton = ({
  absolute = true,
  ...props
}: ModalCloseButtonProps) => {
  return absolute ? (
    <StyledIconButton {...props}>
      <CloseIcon />
    </StyledIconButton>
  ) : (
    <IconButton {...props}>
      <CloseIcon />
    </IconButton>
  );
};

export default ModalCloseButton;
