import { css, displayFlex, keyframes, styled } from '@affine/component';
// @ts-ignore
import spring, { toString } from 'css-spring';

const ANIMATE_DURATION = 400;
export const StyledThemeModeContainer = styled('div')(({ theme }) => {
  return {
    width: '100%',
    height: '48px',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: theme.colors.iconColor,
    fontSize: '16px',
    ...displayFlex('flex-start', 'center'),
    padding: '0 14px',
  };
});
export const StyledThemeButtonContainer = styled('div')(({ theme }) => {
  return {
    border: `1px solid ${theme.colors.borderColor}`,
    borderRadius: '4px',
    cursor: 'pointer',
    ...displayFlex('space-evenly', 'center'),
    flexGrow: 1,
    marginLeft: '12px',
  };
});
export const StyledThemeButton = styled('button')<{
  active: boolean;
}>(({ active, theme }) => {
  return {
    cursor: 'pointer',
    color: active ? theme.colors.primaryColor : theme.colors.iconColor,
  };
});
export const StyledVerticalDivider = styled('div')(({ theme }) => {
  return {
    width: '1px',
    height: '32px',
    borderLeft: `1px solid ${theme.colors.borderColor}`,
  };
});
export const StyledThemeModeSwitch = styled('button')<{
  inMenu?: boolean;
}>(({ inMenu, theme }) => {
  return {
    width: inMenu ? '20px' : '32px',
    height: inMenu ? '20px' : '32px',
    borderRadius: '6px',
    overflow: 'hidden',
    backgroundColor: 'transparent',
    position: 'relative',
    color: theme.colors.iconColor,
    fontSize: inMenu ? '20px' : '24px',
  };
});
export const StyledSwitchItem = styled('div')<{
  active: boolean;
  isHover?: boolean;
  inMenu?: boolean;
}>(({ active, isHover, inMenu, theme }) => {
  const activeRaiseAnimate = toString(
    spring({ top: '0' }, { top: '-100%' }, { preset: 'gentle' })
  );
  const raiseAnimate = toString(
    spring({ top: '100%' }, { top: '0' }, { preset: 'gentle' })
  );
  const activeDeclineAnimate = toString(
    spring({ top: '-100%' }, { top: '0' }, { preset: 'gentle' })
  );
  const declineAnimate = toString(
    spring({ top: '0' }, { top: '100%' }, { preset: 'gentle' })
  );

  const activeStyle = active
    ? {
        color: theme.colors.iconColor,
        top: '0',
        animation: css`
          ${keyframes`${
            isHover ? activeRaiseAnimate : activeDeclineAnimate
          }`} ${ANIMATE_DURATION}ms forwards
        `,
        animationDirection: isHover ? 'normal' : 'alternate',
      }
    : {
        top: '100%',
        color: theme.colors.primaryColor,
        backgroundColor: theme.colors.hoverBackground,
        animation: css`
          ${keyframes`${
            isHover ? raiseAnimate : declineAnimate
          }`} ${ANIMATE_DURATION}ms forwards
        `,
        animationDirection: isHover ? 'normal' : 'alternate',
      };
  return css`
    ${css(displayFlex('center', 'center'))}
    width:${inMenu ? '20px' : '32px'} ;
    height: ${inMenu ? '20px' : '32px'} ;
    position: absolute;
    left: 0;
    cursor: pointer;
    color: ${activeStyle.color}
    top: ${activeStyle.top};
    background-color: ${activeStyle.backgroundColor};
    animation: ${activeStyle.animation};
    animation-direction: ${activeStyle.animationDirection};
    //svg {
    //  width: 24px;
    //  height: 24px;
    //},
  `;
});
