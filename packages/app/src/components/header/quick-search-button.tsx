import React from 'react';
import { IconButton, IconButtonProps } from '@/ui/button';
import { ArrowDownIcon } from '@blocksuite/icons';
import { useModal } from '@/providers/global-modal-provider';

export const QuickSearchButton = ({
  onClick,
  ...props
}: Omit<IconButtonProps, 'children'>) => {
  const { triggerQuickSearchModal } = useModal();

  return (
    <IconButton
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
