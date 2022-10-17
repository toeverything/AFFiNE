import { keyframes, styled } from '@/styles';
import spring, { toString } from 'css-spring';
import type { ItemStatus } from './type';

const ANIMATE_DURATION = 300;

export const StyledAnimateRadioContainer = styled('div')<{ shrink: boolean }>(
  ({ shrink }) => {
    const animateScaleStretch = keyframes`${toString(
      spring({ width: '66px' }, { width: '132px' }, { preset: 'gentle' })
    )}`;
    const animateScaleShrink = keyframes(
      `${toString(
        spring({ width: '132px' }, { width: '66px' }, { preset: 'gentle' })
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
      background: '#F1F3FF',
      position: 'relative',
      display: 'flex',
      transition: `background ${ANIMATE_DURATION}ms`,
      ...shrinkStyle,
    };
  }
);

export const StyledRadioMiddle = styled('div')<{
  hidden: boolean;
}>(({ hidden }) => {
  return {
    width: '6px',
    height: '100%',
    position: 'relative',
    opacity: hidden ? '0' : '1',
  };
});

export const StyledMiddleLine = styled('div')<{ hidden: boolean }>(
  ({ hidden }) => {
    return {
      width: '1px',
      height: '16px',
      background: '#D0D7E3',
      position: 'absolute',
      left: '0',
      right: '0',
      top: '0',
      bottom: '0',
      margin: 'auto',
      opacity: hidden ? '0' : '1',
    };
  }
);

export const StyledRadioItem = styled('div')<{
  status: ItemStatus;
  active: boolean;
}>(({ status, active, theme }) => {
  const animateScaleStretch = keyframes`${toString(
    spring({ width: '66px' }, { width: '116px' })
  )}`;
  const animateScaleOrigin = keyframes(
    `${toString(spring({ width: '116px' }, { width: '66px' }))}`
  );
  const animateScaleShrink = keyframes(
    `${toString(spring({ width: '66px' }, { width: '0px' }))}`
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
          opacity: '0',
        }
      : { animation: `${animateScaleOrigin} ${ANIMATE_DURATION}ms forwards` };

  const {
    colors: { highlight, disabled },
  } = theme;
  return {
    height: '100%',
    display: 'flex',
    cursor: 'pointer',
    overflow: 'hidden',
    color: active ? highlight : disabled,
    ...dynamicStyle,
  };
});

export const StyledLabel = styled('div')<{
  shrink: boolean;
}>(({ shrink }) => {
  const animateScaleStretch = keyframes`${toString(
    spring({ scale: 0 }, { scale: 1 }, { preset: 'gentle' })
  )}`;
  const animateScaleShrink = keyframes(
    `${toString(spring({ scale: 1 }, { scale: 0 }, { preset: 'gentle' }))}`
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
    fontSize: '16px',
    flexShrink: '0',
    transition: `transform ${ANIMATE_DURATION}ms`,
    fontWeight: 'normal',
    ...shrinkStyle,
  };
});

export const StyledIcon = styled('div')<{
  shrink: boolean;
  isLeft: boolean;
}>(({ shrink, isLeft }) => {
  const shrinkStyle = shrink
    ? {
        width: '24px',
        margin: isLeft ? '0 12px' : '0 5px',
      }
    : {
        width: '66px',
      };
  return {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: '0',
    ...shrinkStyle,
  };
});
