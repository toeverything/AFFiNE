import React from 'react';
import { IconButton, IconButtonProps } from '@/ui/button';
import { Tooltip } from '@/ui/tooltip';
import { ArrowDownIcon } from '@blocksuite/icons';
import { useModal } from '@/providers/GlobalModalProvider';
import { useTranslation } from '@affine/i18n';
import { styled } from '@/styles';

const StyledIconButtonWithAnimate = styled(IconButton)(() => {
  return {
    svg: {
      transition: 'transform 0.15s ease-in-out',
    },
    ':hover': {
      svg: {
        transform: 'translateY(3px)',
      },
    },
  };
});
export const QuickSearchButton = ({
  onClick,
  ...props
}: Omit<IconButtonProps, 'children'>) => {
  const { triggerQuickSearchModal } = useModal();
  const { t } = useTranslation();
  return (
    <Tooltip content={t('Jump to')} placement="bottom">
      <StyledIconButtonWithAnimate
        data-testid="header-quickSearchButton"
        {...props}
        onClick={e => {
          onClick?.(e);
          triggerQuickSearchModal();
        }}
      >
        <ArrowDownIcon />
      </StyledIconButtonWithAnimate>
    </Tooltip>
  );
};

export default QuickSearchButton;
