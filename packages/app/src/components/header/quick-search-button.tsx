import React from 'react';
import { IconButton, IconButtonProps } from '@/ui/button';
import { Tooltip } from '@/ui/tooltip';
import { ArrowDownIcon } from '@blocksuite/icons';
import { useModal } from '@/providers/global-modal-provider';

export const QuickSearchButton = ({
  onClick,
  ...props
}: Omit<IconButtonProps, 'children'>) => {
  const { triggerQuickSearchModal } = useModal();

  return (
    <Tooltip content="Search and quickly jump to a page" placement="bottom">
      <IconButton
        {...props}
        onClick={e => {
          onClick?.(e);
          triggerQuickSearchModal();
        }}
      >
        <ArrowDownIcon />
      </IconButton>
    </Tooltip>
  );
};

export default QuickSearchButton;
