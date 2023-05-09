import type { TooltipProps } from '@mui/material';

import { css, displayFlex, styled } from '../../styles';
import { Popper, type PopperProps } from '../popper';
import StyledPopperContainer from '../shared/container';
const StyledTooltip = styled(StyledPopperContainer)(() => {
  return {
    width: '390px',
    minHeight: '92px',
    padding: '12px',
    backgroundColor: 'var(--affine-tertiary-color)',
    transform: 'all 0.15s',
    color: 'var(--affine-text-emphasis-color)',
    ...displayFlex('center', 'center'),
    border: `1px solid var(--affine-text-emphasis-color)`,
    fontSize: 'var(--affine-font-sm)',
    lineHeight: '22px',
    fontWeight: 500,
  };
});

const StyledCircleContainer = styled('div')(() => {
  return css`
    position: relative;
    content: '';
    top: 50%;
    left: 50%;
    transform: translate(0%, 0%);
    width: 0;
    height: 40px;
    border-right: 1px solid var(--affine-text-emphasis-color);
    &::after {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translate(-50%, -100%);
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 1px solid var(--affine-text-emphasis-color);
    }
    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translate(-50%, -150%);
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--affine-text-emphasis-color);
      border: 1px solid var(--affine-text-emphasis-color);
  `;
});

export const QuickSearchTips = (
  props: PopperProps & Omit<TooltipProps, 'title' | 'content'>
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
