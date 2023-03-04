import { displayFlex, styled } from '@affine/component';
// @ts-ignore
import { CSSProperties } from 'react';

const ANIMATE_DURATION = 400;

export const StyledThemeModeSwitch = styled('div')({
  width: '32px',
  height: '32px',
  borderRadius: '6px',
  overflow: 'hidden',
  backgroundColor: 'transparent',
  position: 'relative',
});
export const StyledSwitchItem = styled('div')<{
  active: boolean;
  isHover: boolean;
  firstTrigger: boolean;
}>(({ active, isHover, firstTrigger, theme }) => {
  // const activeRaiseAnimate = keyframes`${css`
  //   ${(
  //     spring({ top: '0' }, { top: '-100%' }, { preset: 'gentle' })
  //   )}
  // `}`;
  // const raiseAnimate = keyframes`${css`
  //   ${(
  //     spring({ top: '100%' }, { top: '0' }, { preset: 'gentle' })
  //   )}
  // `}`;
  // const activeDeclineAnimate = keyframes`${css`
  //   ${(
  //     spring({ top: '-100%' }, { top: '0' }, { preset: 'gentle' })
  //   )}
  // `}`;
  // const declineAnimate = keyframes`${css`
  //   ${(
  //     spring({ top: '0' }, { top: '100%' }, { preset: 'gentle' })
  //   )}
  // `}`;
  const activeStyle = active
    ? {
        color: theme.colors.iconColor,
        top: '0',
        animation: firstTrigger
          ? `${
              ''
              // isHover ? activeRaiseAnimate : activeDeclineAnimate
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
              ''
              // isHover ? raiseAnimate : declineAnimate
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
    svg: {
      width: '24px',
      height: '24px',
    },
  };
});
