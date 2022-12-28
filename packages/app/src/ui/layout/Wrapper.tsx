import type { CSSProperties } from 'react';
import { styled } from '@/styles';

export type WrapperProps = {
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
      'justifyContent',
      'alignItems',
      'wrap',
      'flexDirection',
      'flexShrink',
      'flexGrow',
    ].includes(prop);
  },
})<WrapperProps>(
  ({
    display = 'flex',
    justifyContent = 'flex-start',
    alignItems = 'center',
    wrap = false,
    flexDirection = 'row',
    flexShrink = '0',
    flexGrow = '0',
  }) => {
    return {
      display,
      justifyContent,
      alignItems,
      flexWrap: wrap ? 'wrap' : 'nowrap',
      flexDirection,
      flexShrink,
      flexGrow,
    };
  }
);

export default Wrapper;
