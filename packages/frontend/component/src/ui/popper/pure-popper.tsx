import type { PopperProps as PopperUnstyledProps } from '@mui/base/Popper';
import Grow from '@mui/material/Grow';
import type { CSSProperties, PropsWithChildren } from 'react';
import { useState } from 'react';

import { PopperArrow } from './popover-arrow';
import { BasicStyledPopper } from './popper';
import { PopperWrapper } from './styles';

export type PurePopperProps = {
  zIndex?: CSSProperties['zIndex'];

  offset?: [number, number];

  showArrow?: boolean;
} & PopperUnstyledProps &
  PropsWithChildren;

export const PurePopper = (props: PurePopperProps) => {
  const {
    children,
    zIndex,
    offset,
    showArrow = false,
    modifiers = [],
    placement,
    ...otherProps
  } = props;
  const [arrowRef, setArrowRef] = useState<HTMLElement | null>();

  return (
    <BasicStyledPopper
      zIndex={zIndex}
      transition
      modifiers={[
        {
          name: 'offset',
          options: {
            offset,
          },
        },
        {
          name: 'arrow',
          enabled: showArrow,
          options: {
            element: arrowRef,
          },
        },
        ...modifiers,
      ]}
      placement={placement}
      {...otherProps}
    >
      {({ TransitionProps }) => (
        <Grow {...TransitionProps}>
          <PopperWrapper>
            {showArrow && (
              <PopperArrow placement={placement} ref={setArrowRef} />
            )}
            {children}
          </PopperWrapper>
        </Grow>
      )}
    </BasicStyledPopper>
  );
};
