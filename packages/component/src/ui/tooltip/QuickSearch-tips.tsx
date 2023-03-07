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
    width: '50px',
    height: '50px',
    '&::after': {
      content: '',
      position: 'absolute',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: '2px',
      height: '30px',
      border: '4px solid #000',
      backgroundColor: '#66ccff',
    },
  };
});
const StyledOuterCircle = styled('div')(({ theme }) => {
  return {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    border: '2px solid #000',
  };
});
const StyledInnerCircle = styled('div')(({ theme }) => {
  return {
    position: 'absolute',
    top: '8px',
    left: '8px',
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    border: '2px solid #000',
  };
});

const StyledCircle = () => {
  return (
    <>
      <StyledCircleContainer>
        <StyledOuterCircle></StyledOuterCircle>
        <StyledInnerCircle></StyledInnerCircle>
      </StyledCircleContainer>
    </>
  );
};

export const QuickSearchTips = (
  props: PopperProps & Omit<TooltipProps, 'title'>
) => {
  const { content, placement = 'top', children } = props;
  return (
    <Popper
      {...props}
      content={
        <>
          <StyledCircle />
          <StyledTooltip placement={placement}>{content}</StyledTooltip>
        </>
      }
    >
      {children}
    </Popper>
  );
};
