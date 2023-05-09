import type { CSSProperties } from 'react';

import { styled } from '../../styles';

export type WrapperProps = {
  display?: CSSProperties['display'];
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  padding?: CSSProperties['padding'];
  paddingTop?: CSSProperties['paddingTop'];
  paddingRight?: CSSProperties['paddingRight'];
  paddingLeft?: CSSProperties['paddingLeft'];
  paddingBottom?: CSSProperties['paddingBottom'];
  margin?: CSSProperties['margin'];
  marginTop?: CSSProperties['marginTop'];
  marginLeft?: CSSProperties['marginLeft'];
  marginRight?: CSSProperties['marginRight'];
  marginBottom?: CSSProperties['marginBottom'];
};

export type FlexWrapperProps = {
  display?: CSSProperties['display'];
  flexDirection?: CSSProperties['flexDirection'];
  justifyContent?: CSSProperties['justifyContent'];
  alignItems?: CSSProperties['alignItems'];
  wrap?: boolean;
  flexShrink?: CSSProperties['flexShrink'];
  flexGrow?: CSSProperties['flexGrow'];
};

// Sometimes we just want to wrap a component with a div to set flex or other styles, but we don't want to create a new component for it.
export const Wrapper = styled('div', {
  shouldForwardProp: prop => {
    return ![
      'display',
      'width',
      'height',
      'padding',
      'margin',
      'paddingTop',
      'paddingRight',
      'paddingLeft',
      'paddingBottom',
      'marginTop',
      'marginLeft',
      'marginRight',
      'marginBottom',
    ].includes(prop as string);
  },
})<WrapperProps>(
  ({
    display,
    width,
    height,
    padding,
    margin,
    paddingTop,
    paddingRight,
    paddingLeft,
    paddingBottom,
    marginTop,
    marginLeft,
    marginRight,
    marginBottom,
  }) => {
    return {
      display,
      width,
      height,
      padding,
      margin,
      paddingTop,
      paddingRight,
      paddingLeft,
      paddingBottom,
      marginTop,
      marginLeft,
      marginRight,
      marginBottom,
    };
  }
);

export const FlexWrapper = styled(Wrapper, {
  shouldForwardProp: prop => {
    return ![
      'justifyContent',
      'alignItems',
      'wrap',
      'flexDirection',
      'flexShrink',
      'flexGrow',
    ].includes(prop as string);
  },
})<FlexWrapperProps>(
  ({
    justifyContent,
    alignItems,
    wrap = false,
    flexDirection,
    flexShrink,
    flexGrow,
  }) => {
    return {
      display: 'flex',
      justifyContent,
      alignItems,
      flexWrap: wrap ? 'wrap' : 'nowrap',
      flexDirection,
      flexShrink,
      flexGrow,
    };
  }
);

// TODO: Complete me
export const GridWrapper = styled(Wrapper, {
  shouldForwardProp: prop => {
    return ![''].includes(prop as string);
  },
})<WrapperProps>(() => {
  return {
    display: 'grid',
  };
});

export default Wrapper;
