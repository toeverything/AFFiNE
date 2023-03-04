import { css, displayFlex, keyframes, styled } from '@affine/component';
// @ts-ignore
import spring, { toString } from 'css-spring';

// @ts-ignore
import type { ItemStatus } from './type';

const ANIMATE_DURATION = 500;

export const StyledAnimateRadioContainer = styled('div')<{
  shrink: boolean;
  disabled: boolean;
}>(({ shrink, theme, disabled }) => {
  const animateScaleStretch = toString(
    spring({ width: '36px' }, { width: '160px' }, { preset: 'gentle' })
  );
  const animateScaleShrink = toString(
    spring({ width: '160px' }, { width: '36px' }, { preset: 'gentle' })
  );
  const shrinkStyle: any = shrink
    ? {
        animation: css`
          ${keyframes`${animateScaleShrink}`} ${ANIMATE_DURATION}ms forwards
        `,
        background: 'transparent',
      }
    : {
        animation: css`
          ${keyframes`${animateScaleStretch}`} ${ANIMATE_DURATION}ms forwards
        `,
      };
  return css`
    height: 36px;
    border-radius: 18px;
    background: ${disabled ? 'transparent' : theme.colors.hoverBackground}
    position: relative;
    display: flex;
    transition: background ${ANIMATE_DURATION}ms, border ${ANIMATE_DURATION}ms;
    border: 1px solid transparent;
    ${
      disabled
        ? css`
            pointer-events: none;
          `
        : css`
            animation: ${shrinkStyle.animation};
            background: ${shrinkStyle.background};
          `
    }

    //...(disabled ? { pointerEvents: 'none' } : shrinkStyle),
    :hover {
      border: ${disabled ? '' : `1px solid ${theme.colors.primaryColor}`}
    }
  `;
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
  const animateScaleStretch = toString(
    spring({ width: '44px' }, { width: '112px' })
  );
  const animateScaleOrigin = toString(
    spring({ width: '112px' }, { width: '44px' })
  );
  const animateScaleShrink = toString(
    spring({ width: '0px' }, { width: '36px' })
  );
  const dynamicStyle =
    status === 'stretch'
      ? {
          animation: css`
            ${keyframes`${animateScaleStretch}`} ${ANIMATE_DURATION}ms forwards
          `,
          flexShrink: '0',
        }
      : status === 'shrink'
      ? {
          animation: css`
            ${keyframes`${animateScaleShrink}`} ${ANIMATE_DURATION}ms forwards
          `,
        }
      : status === 'normal'
      ? {
          animation: css`
            ${keyframes`${animateScaleOrigin}`} ${ANIMATE_DURATION}ms forwards
          `,
        }
      : {};

  const {
    colors: { iconColor, primaryColor },
  } = theme;
  return css`
    width: 0;
    height: 100%;
    display: flex;
    cursor: pointer;
    overflow: hidden;
    color: ${active ? primaryColor : iconColor};
    animation: ${dynamicStyle.animation};
    flex-shrink: ${dynamicStyle.flexShrink};
  `;
});

export const StyledLabel = styled('div')<{
  shrink: boolean;
  isLeft: boolean;
}>(({ shrink, isLeft }) => {
  const animateScaleStretch = toString(
    spring(
      { width: '0px' },
      { width: isLeft ? '65px' : '75px' },
      { preset: 'gentle' }
    )
  );
  const animateScaleShrink = toString(
    spring(
      { width: isLeft ? '65px' : '75px' },
      { width: '0px' },
      { preset: 'gentle' }
    )
  );
  const shrinkStyle = shrink
    ? {
        animation: css`
          ${keyframes`${animateScaleShrink}`} ${ANIMATE_DURATION}ms forwards
        `,
      }
    : {
        animation: css`
          ${keyframes`${animateScaleStretch}`} ${ANIMATE_DURATION}ms forwards
        `,
      };

  return css`
    display: flex;
    align-items: center;
    justify-content: ${isLeft ? 'flex-start' : 'flex-end'};
    font-size: 16px;
    flex-shrink: 0;
    transition: transform ${ANIMATE_DURATION}ms;
    font-weight: normal;
    overflow: hidden;
    white-space: nowrap;
    animation: ${shrinkStyle.animation};
  `;
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
