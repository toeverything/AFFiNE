import type { CSSProperties } from 'react';
import { styled } from '@/styles';

export type WrapperProps = {
  display?: CSSProperties['display'];
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  padding?: CSSProperties['padding'];
  margin?: CSSProperties['margin'];
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
    return !['display', 'width', 'height', 'padding', 'margin'].includes(prop);
  },
})<WrapperProps>(({ display, width, height, padding, margin }) => {
  return {
    display,
    width,
    height,
    padding,
    margin,
  };
});

export const FlexWrapper = styled(Wrapper, {
  shouldForwardProp: prop => {
    return ![
      'justifyContent',
      'alignItems',
      'wrap',
      'flexDirection',
      'flexShrink',
      'flexGrow',
    ].includes(prop);
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
    return ![''].includes(prop);
  },
})<WrapperProps>(() => {
  return {
    display: 'grid',
  };
});

export default Wrapper;
