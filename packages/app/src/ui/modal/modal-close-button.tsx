import { HTMLAttributes } from 'react';
import { StyledCloseButton } from './style';
import { CloseIcon } from '@blocksuite/icons';

export type ModalCloseButtonProps = {
  top?: number;
  right?: number;
  triggerSize?: [number, number];
  size?: [number, number];
  iconSize?: [number, number];
} & HTMLAttributes<HTMLButtonElement>;

export const ModalCloseButton = ({
  iconSize = [24, 24],
  ...props
}: ModalCloseButtonProps) => {
  const [iconWidth, iconHeight] = iconSize;
  return (
    <StyledCloseButton {...props}>
      <CloseIcon width={iconWidth} height={iconHeight} />
    </StyledCloseButton>
  );
};

export default ModalCloseButton;
