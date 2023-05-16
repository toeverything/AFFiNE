import { css, displayFlex, keyframes, styled } from '@affine/component';
// @ts-ignore
import spring, { toString } from 'css-spring';

const ANIMATE_DURATION = 400;
export const StyledThemeModeContainer = styled('div')(() => {
  return {
    width: '100%',
    height: '48px',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: 'var(--affine-icon-color)',
    fontSize: '16px',
    ...displayFlex('flex-start', 'center'),
    padding: '0 14px',
  };
});
export const StyledThemeButtonContainer = styled('div')(() => {
  return {
    height: '32px',
    border: `1px solid var(--affine-border-color)`,
    borderRadius: '4px',
    cursor: 'pointer',
    ...displayFlex('space-evenly', 'center'),
    flexGrow: 1,
    marginLeft: '12px',
  };
});
export const StyledThemeButton = styled('button')<{
  active: boolean;
}>(({ active }) => {
  return {
    padding: '0 8px',
    height: '100%',
    flex: 1,
    cursor: 'pointer',
    color: active ? 'var(--affine-primary-color)' : 'var(--affine-icon-color)',
    whiteSpace: 'nowrap',
  };
});
export const StyledVerticalDivider = styled('div')(() => {
  return {
    width: '1px',
    height: '100%',
    borderLeft: `1px solid var(--affine-border-color)`,
  };
});
export const StyledThemeModeSwitch = styled('button')<{
  inMenu?: boolean;
}>(({ inMenu }) => {
  return {
    width: inMenu ? '20px' : '32px',
    height: inMenu ? '20px' : '32px',
    borderRadius: '6px',
    overflow: 'hidden',
    WebkitAppRegion: 'no-drag',
    backgroundColor: 'transparent',
    position: 'relative',
    color: 'var(--affine-icon-color)',
    fontSize: inMenu ? '20px' : '24px',
  };
});
export const StyledSwitchItem = styled('div')<{
  active: boolean;
  isHover?: boolean;
  inMenu?: boolean;
}>(({ active, isHover, inMenu }) => {
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
        color: 'var(--affine-icon-color)',
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
        color: 'var(--affine-primary-color)',
        backgroundColor: 'var(--affine-hover-color)',
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
