import React from 'react';
import { IconButton, IconButtonProps } from '@/ui/button';
import { ArrowDownIcon } from '@blocksuite/icons';
import { useModal } from '@/providers/GlobalModalProvider';
export const QuickSearchButton = ({
  onClick,
  ...props
}: Omit<IconButtonProps, 'children'>) => {
  const { triggerQuickSearchModal } = useModal();
  return (
    <IconButton
      data-testid="header-quickSearchButton"
      {...props}
      onClick={e => {
        onClick?.(e);
        triggerQuickSearchModal();
      }}
    >
      <ArrowDownIcon />
    </IconButton>
  );
};

export default QuickSearchButton;
