import type { TooltipProps } from '@mui/material';

import { styled } from '../../styles';
import { Popper, type PopperProps } from '../popper';
import StyledPopperContainer from '../shared/Container';
const StyledTooltip = styled(StyledPopperContainer)(({ theme }) => {
  return {
    maxWidth: '320px',
    boxShadow: 'var(--affine-text-popover-shadow)',
    padding: '4px 12px',
    backgroundColor: 'var(--affine-tooltip)',
    color: '#fff',
    fontSize: 'var(--affine-font-sm)',
  };
});

export const Tooltip = (props: PopperProps & Omit<TooltipProps, 'title'>) => {
  const { content, placement = 'top-start', children } = props;
  return (
    <Popper
      {...props}
      content={<StyledTooltip placement={placement}>{content}</StyledTooltip>}
    >
      {children}
    </Popper>
  );
};
