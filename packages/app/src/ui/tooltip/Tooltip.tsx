import { type PropsWithChildren } from 'react';
import StyledPopperContainer from '../shared/Container';
import { Popper, type PopperProps } from '../popper';
import { styled } from '@/styles';
import type { TooltipProps } from '@mui/material';

const StyledTooltip = styled(StyledPopperContainer)(({ theme }) => {
  return {
    boxShadow: theme.shadow.tooltip,
    padding: '4px 12px',
    backgroundColor:
      theme.mode === 'dark'
        ? theme.colors.popoverBackground
        : theme.colors.primaryColor,
    color: '#fff',
    fontSize: theme.font.xs,
  };
});

export const Tooltip = (
  props: PropsWithChildren<PopperProps & Omit<TooltipProps, 'title'>>
) => {
  const { content, placement = 'top-start' } = props;
  // If there is no content, hide forever
  return content ? (
    <Popper
      {...props}
      showArrow={false}
      content={<StyledTooltip placement={placement}>{content}</StyledTooltip>}
    />
  ) : null;
};
