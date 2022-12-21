import { displayFlex, keyframes, styled } from '@/styles';
import { CSSProperties } from 'react';
// @ts-ignore
import spring, { toString } from 'css-spring';

const ANIMATE_DURATION = 400;

export const StyledThemeModeSwitch = styled('div')({
  width: '32px',
  height: '32px',
  borderRadius: '5px',
  overflow: 'hidden',
  backgroundColor: 'transparent',
  position: 'relative',
});
export const StyledSwitchItem = styled('div')<{
  active: boolean;
  isHover: boolean;
  firstTrigger: boolean;
}>(({ active, isHover, firstTrigger, theme }) => {
  const activeRaiseAnimate = keyframes`${toString(
    spring({ top: '0' }, { top: '-100%' }, { preset: 'gentle' })
  )}`;
  const raiseAnimate = keyframes`${toString(
    spring({ top: '100%' }, { top: '0' }, { preset: 'gentle' })
  )}`;
  const activeDeclineAnimate = keyframes`${toString(
    spring({ top: '-100%' }, { top: '0' }, { preset: 'gentle' })
  )}`;
  const declineAnimate = keyframes`${toString(
    spring({ top: '0' }, { top: '100%' }, { preset: 'gentle' })
  )}`;
  const activeStyle = active
    ? {
        color: theme.colors.iconColor,
        top: '0',
        animation: firstTrigger
          ? `${
              isHover ? activeRaiseAnimate : activeDeclineAnimate
            } ${ANIMATE_DURATION}ms forwards`
          : 'unset',
        animationDirection: isHover ? 'normal' : 'alternate',
      }
    : ({
        top: '100%',
        color: theme.colors.primaryColor,
        backgroundColor: theme.colors.hoverBackground,
        animation: firstTrigger
          ? `${
              isHover ? raiseAnimate : declineAnimate
            } ${ANIMATE_DURATION}ms forwards`
          : 'unset',
        animationDirection: isHover ? 'normal' : 'alternate',
      } as CSSProperties);

  return {
    width: '32px',
    height: '32px',
    position: 'absolute',
    left: '0',
    ...displayFlex('center', 'center'),
    cursor: 'pointer',
    ...activeStyle,
  };
});
