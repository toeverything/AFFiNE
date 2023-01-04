import React from 'react';
import { IconButton, IconButtonProps } from '@/ui/button';
import { Tooltip } from '@/ui/tooltip';
import { ArrowDownIcon } from '@blocksuite/icons';
import { useModal } from '@/providers/global-modal-provider';
import { useTranslation } from 'react-i18next';
export const QuickSearchButton = ({
  onClick,
  ...props
}: Omit<IconButtonProps, 'children'>) => {
  const { triggerQuickSearchModal } = useModal();
  const { t } = useTranslation();
  return (
    <Tooltip content={t('Switch to')} placement="bottom">
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
    </Tooltip>
  );
};

export default QuickSearchButton;
