import { HTMLAttributes } from 'react';
import { CloseIcon } from '@blocksuite/icons';
import { IconButton, IconButtonProps } from '@/ui/button';
import { styled } from '@/styles';
export type ModalCloseButtonProps = {
  top?: number;
  right?: number;
} & Omit<IconButtonProps, 'children'> &
  HTMLAttributes<HTMLButtonElement>;

const StyledIconButton = styled(IconButton)<
  Pick<ModalCloseButtonProps, 'top' | 'right'>
>(({ top, right }) => {
  return {
    position: 'absolute',
    top: top ?? 6,
    right: right ?? 6,
  };
});

export const ModalCloseButton = ({ ...props }: ModalCloseButtonProps) => {
  return (
    <StyledIconButton {...props}>
      <CloseIcon />
    </StyledIconButton>
  );
};

export default ModalCloseButton;
