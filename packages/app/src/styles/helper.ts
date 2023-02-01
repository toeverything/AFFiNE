import type { CSSProperties } from 'react';

export const displayFlex = (
  justifyContent: CSSProperties['justifyContent'] = 'unset',
  alignItems: CSSProperties['alignItems'] = 'unset',
  alignContent: CSSProperties['alignContent'] = 'unset'
): {
  display: CSSProperties['display'];
  justifyContent: CSSProperties['justifyContent'];
  alignItems: CSSProperties['alignItems'];
  alignContent: CSSProperties['alignContent'];
} => {
  return {
    display: 'flex',
    justifyContent,
    alignItems,
    alignContent,
  };
};
export const displayInlineFlex = (
  justifyContent: CSSProperties['justifyContent'] = 'unset',
  alignItems: CSSProperties['alignContent'] = 'unset',
  alignContent: CSSProperties['alignContent'] = 'unset'
): {
  display: CSSProperties['display'];
  justifyContent: CSSProperties['justifyContent'];
  alignItems: CSSProperties['alignContent'];
  alignContent: CSSProperties['alignContent'];
} => {
  return {
    display: 'inline-flex',
    justifyContent,
    alignItems,
    alignContent,
  };
};

export const absoluteCenter = ({
  horizontal = false,
  vertical = false,
  position: { left, right, top, bottom } = {},
}: {
  horizontal?: boolean;
  vertical?: boolean;
  position?: {
    left?: CSSProperties['left'];
    right?: CSSProperties['right'];
    top?: CSSProperties['top'];
    bottom?: CSSProperties['bottom'];
  };
}): {
  position: CSSProperties['position'];
  left: CSSProperties['left'];
  top: CSSProperties['top'];
  right: CSSProperties['right'];
  bottom: CSSProperties['bottom'];
  transform: CSSProperties['transform'];
} => {
  return {
    position: 'absolute',
    left: left ? left : horizontal ? '50%' : 'auto',
    top: top ? top : vertical ? '50%' : 'auto',
    right: right ? right : horizontal ? 'auto' : 'auto',
    bottom: bottom ? bottom : vertical ? 'auto' : 'auto',
    transform: `translate(${horizontal ? '-50%' : '0'}, ${
      vertical ? '-50%' : '0'
    })`,
  };
};
export const fixedCenter = ({
  horizontal = false,
  vertical = false,
  position: { left, right, top, bottom } = {},
}: {
  horizontal?: boolean;
  vertical?: boolean;
  position?: {
    left?: CSSProperties['left'];
    right?: CSSProperties['right'];
    top?: CSSProperties['top'];
    bottom?: CSSProperties['bottom'];
  };
}): {
  position: CSSProperties['position'];
  left: CSSProperties['left'];
  top: CSSProperties['top'];
  right: CSSProperties['right'];
  bottom: CSSProperties['bottom'];
  transform: CSSProperties['transform'];
} => {
  return {
    position: 'fixed',
    left: left ? left : horizontal ? '50%' : 'auto',
    top: top ? top : vertical ? '50%' : 'auto',
    right: right ? right : horizontal ? 'auto' : 'auto',
    bottom: bottom ? bottom : vertical ? 'auto' : 'auto',
    transform: `translate(${horizontal ? '-50%' : '0'}, ${
      vertical ? '-50%' : '0'
    })`,
  };
};

export const textEllipsis = (lineNum = 1): CSSProperties => {
  if (lineNum > 1) {
    return {
      display: '-webkit-box',
      wordBreak: 'break-all',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: `${lineNum}`, //the number of rows to display
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    };
  }
  return {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };
};

export const positionAbsolute = ({
  left,
  top,
  right,
  bottom,
}: {
  left?: CSSProperties['left'];
  top?: CSSProperties['top'];
  right?: CSSProperties['right'];
  bottom?: CSSProperties['bottom'];
}): {
  position: CSSProperties['position'];
  left: CSSProperties['left'];
  top: CSSProperties['top'];
  right: CSSProperties['right'];
  bottom: CSSProperties['bottom'];
} => {
  return {
    position: 'absolute',
    left,
    top,
    right,
    bottom,
  };
};
