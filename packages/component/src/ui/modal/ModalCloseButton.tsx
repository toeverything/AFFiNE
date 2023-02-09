import { HTMLAttributes } from 'react';
import { CloseIcon } from '@blocksuite/icons';
import { IconButton, IconButtonProps } from '../button/IconButton';
import { styled } from '../../styles';
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
