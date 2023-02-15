import { displayFlex, keyframes, styled } from '@affine/component';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import spring, { toString } from 'css-spring';
import type { ItemStatus } from './type';

const ANIMATE_DURATION = 500;

export const StyledAnimateRadioContainer = styled('div')<{
  shrink: boolean;
  disabled: boolean;
}>(({ shrink, theme, disabled }) => {
  const animateScaleStretch = keyframes`${toString(
    spring({ width: '36px' }, { width: '160px' }, { preset: 'gentle' })
  )}`;
  const animateScaleShrink = keyframes(
    `${toString(
      spring({ width: '160px' }, { width: '36px' }, { preset: 'gentle' })
    )}`
  );
  const shrinkStyle = shrink
    ? {
        animation: `${animateScaleShrink} ${ANIMATE_DURATION}ms forwards`,
        background: 'transparent',
      }
    : {
        animation: `${animateScaleStretch} ${ANIMATE_DURATION}ms forwards`,
      };

  return {
    height: '36px',
    borderRadius: '18px',
    background: disabled ? 'transparent' : theme.colors.hoverBackground,
    position: 'relative',
    display: 'flex',
    transition: `background ${ANIMATE_DURATION}ms, border ${ANIMATE_DURATION}ms`,
    border: '1px solid transparent',

    ...(disabled ? { pointerEvents: 'none' } : shrinkStyle),
    ':hover': {
      border: disabled ? '' : `1px solid ${theme.colors.primaryColor}`,
    },
  };
});

export const StyledMiddleLine = styled('div')<{
  hidden: boolean;
  dark: boolean;
}>(({ hidden, dark }) => {
  return {
    width: '1px',
    height: '16px',
    background: dark ? '#4d4c53' : '#D0D7E3',
    top: '0',
    bottom: '0',
    margin: 'auto',
    opacity: hidden ? '0' : '1',
  };
});

export const StyledRadioItem = styled('div')<{
  status: ItemStatus;
  active: boolean;
}>(({ status, active, theme }) => {
  const animateScaleStretch = keyframes`${toString(
    spring({ width: '44px' }, { width: '112px' })
  )}`;
  const animateScaleOrigin = keyframes(
    `${toString(spring({ width: '112px' }, { width: '44px' }))}`
  );
  const animateScaleShrink = keyframes(
    `${toString(spring({ width: '0px' }, { width: '36px' }))}`
  );
  const dynamicStyle =
    status === 'stretch'
      ? {
          animation: `${animateScaleStretch} ${ANIMATE_DURATION}ms forwards`,
          flexShrink: '0',
        }
      : status === 'shrink'
      ? {
          animation: `${animateScaleShrink} ${ANIMATE_DURATION}ms forwards`,
        }
      : status === 'normal'
      ? { animation: `${animateScaleOrigin} ${ANIMATE_DURATION}ms forwards` }
      : {};

  const {
    colors: { iconColor, primaryColor },
  } = theme;
  return {
    width: '0',
    height: '100%',
    display: 'flex',
    cursor: 'pointer',
    overflow: 'hidden',
    color: active ? primaryColor : iconColor,
    ...dynamicStyle,
  };
});

export const StyledLabel = styled('div')<{
  shrink: boolean;
  isLeft: boolean;
}>(({ shrink, isLeft }) => {
  const animateScaleStretch = keyframes`${toString(
    spring(
      { width: '0px' },
      { width: isLeft ? '65px' : '75px' },
      { preset: 'gentle' }
    )
  )}`;
  const animateScaleShrink = keyframes(
    `${toString(
      spring(
        { width: isLeft ? '65px' : '75px' },
        { width: '0px' },
        { preset: 'gentle' }
      )
    )}`
  );
  const shrinkStyle = shrink
    ? {
        animation: `${animateScaleShrink} ${ANIMATE_DURATION}ms forwards`,
      }
    : {
        animation: `${animateScaleStretch} ${ANIMATE_DURATION}ms forwards`,
      };

  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: isLeft ? 'flex-start' : 'flex-end',
    fontSize: '16px',
    flexShrink: '0',
    transition: `transform ${ANIMATE_DURATION}ms`,
    fontWeight: 'normal',
    overflow: 'hidden',
    ...shrinkStyle,
  };
});

export const StyledIcon = styled('div')<{
  shrink: boolean;
  isLeft: boolean;
}>(({ shrink, isLeft }) => {
  const dynamicStyle = shrink
    ? { width: '36px' }
    : { width: isLeft ? '44px' : '34px' };
  return {
    ...displayFlex('center', 'center'),
    flexShrink: '0',
    ...dynamicStyle,
  };
});
