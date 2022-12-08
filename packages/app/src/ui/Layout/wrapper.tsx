import type { CSSProperties, HTMLAttributes, PropsWithChildren } from 'react';
import { StyledWrapper } from './styles';

// Sometimes we just want to wrap a component with a div to set flex or other styles, but we don't want to create a new component for it.
export type WrapperProps = {
  display?: CSSProperties['display'];
  flexDirection?: CSSProperties['flexDirection'];
  justifyContent?: CSSProperties['justifyContent'];
  alignItems?: CSSProperties['alignItems'];
  flexWrap?: CSSProperties['flexWrap'];
  flexShrink?: CSSProperties['flexShrink'];
  flexGrow?: CSSProperties['flexGrow'];
};

export const Wrapper = ({
  children,
  display = 'flex',
  justifyContent = 'flex-start',
  alignItems = 'center',
  flexWrap = 'nowrap',
  flexDirection = 'row',
  flexShrink = '0',
  flexGrow = '0',
  ...props
}: PropsWithChildren<WrapperProps & HTMLAttributes<HTMLDivElement>>) => {
  return (
    <StyledWrapper
      display={display}
      justifyContent={justifyContent}
      alignItems={alignItems}
      flexWrap={flexWrap}
      flexDirection={flexDirection}
      flexShrink={flexShrink}
      flexGrow={flexGrow}
      {...props}
    >
      {children}
    </StyledWrapper>
  );
};

export default Wrapper;
