import type { TooltipProps } from '@mui/material';

import { displayFlex, styled } from '../../styles';
import { Popper, type PopperProps } from '../popper';
import StyledPopperContainer from '../shared/Container';
const StyledTooltip = styled(StyledPopperContainer)(({ theme }) => {
  return {
    width: '378px',
    minHeight: '92px',
    boxShadow: theme.shadow.tooltip,
    padding: '12px',
    backgroundColor: theme.colors.hoverBackground,
    color: theme.colors.primaryColor,
    ...displayFlex('center', 'center'),
    border: `1px solid ${theme.colors.primaryColor}`,
    fontSize: theme.font.sm,
    lineHeight: '22px',
    fontWeight: 500,
  };
});

const StyledCircleContainer = styled('div')(({ theme }) => {
  return {
    position: 'relative',
    content: '""',
    top: '50%',
    left: '50%',
    transform: 'translate(0%, 0%)',
    width: '0px',
    height: '40px',
    border: `1px solid ${theme.colors.primaryColor}}`,
    // '&::after': {
    //   content: '""',
    //   position: 'absolute',
    //   top: '50%',
    //   left: '50%',
    //   transform: 'translate(-50%, -50%)',
    //   width: '100%',
    //   height: '100%',
    //   borderRadius: '50%',
    //   border: `1px solid ${theme.colors.primaryColor}`,
    // },
    // '&::before': {
    //   content: '""',
    //   position: 'absolute',
    //   top: '50%',
    //   left: '50%',
    //   transform: 'translate(-50%, -50%)',
    //   width: '50%',
    //   height: '50%',
    //   backgroundColor: theme.colors.primaryColor,
    //   borderRadius: '50%',
    //   border: `1px solid ${theme.colors.primaryColor}`,
    // },
  };
});

export const QuickSearchTips = (
  props: PopperProps & Omit<TooltipProps, 'title'>
) => {
  const { content, placement = 'top', children } = props;
  return (
    <Popper
      {...props}
      content={
        <div>
          <StyledCircleContainer />
          <StyledTooltip placement={placement}>{content}</StyledTooltip>
        </div>
      }
    >
      {children}
    </Popper>
  );
};
