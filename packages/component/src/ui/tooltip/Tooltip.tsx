import StyledPopperContainer from '../shared/Container';
import { Popper, type PopperProps } from '../popper';
import { styled } from '../../styles';
import type { TooltipProps } from '@mui/material';

const StyledTooltip = styled(StyledPopperContainer)(({ theme }) => {
  return {
    maxWidth: '320px',
    boxShadow: theme.shadow.tooltip,
    padding: '4px 12px',
    backgroundColor: theme.colors.tooltipBackground,
    color: '#fff',
    fontSize: theme.font.xs,
  };
});

export const Tooltip = (props: PopperProps & Omit<TooltipProps, 'title'>) => {
  const { content, placement = 'top-start', children } = props;
  return (
    <Popper
      {...props}
      showArrow={false}
      content={<StyledTooltip placement={placement}>{content}</StyledTooltip>}
    >
      {children}
    </Popper>
  );
};
