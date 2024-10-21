import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import { forwardRef, type HTMLAttributes } from 'react';

import { withUnit } from '../../utils/with-unit';
import { bottomOffsetVar, safeArea, topOffsetVar } from './style.css';

interface SafeAreaProps extends HTMLAttributes<HTMLDivElement> {
  top?: boolean;
  bottom?: boolean;
  topOffset?: number | string;
  bottomOffset?: number | string;
}

export const SafeArea = forwardRef<HTMLDivElement, SafeAreaProps>(
  function SafeArea(
    {
      children,
      className,
      style,
      top,
      bottom,
      topOffset = 0,
      bottomOffset = 0,
      ...attrs
    },
    ref
  ) {
    return (
      <div
        ref={ref}
        className={clsx(safeArea, className)}
        data-standalone={
          environment.isPwa || BUILD_CONFIG.isAndroid || BUILD_CONFIG.isIOS
            ? ''
            : undefined
        }
        data-bottom={bottom ? '' : undefined}
        data-top={top ? '' : undefined}
        style={{
          ...style,
          ...assignInlineVars({
            [topOffsetVar]: withUnit(topOffset, 'px'),
            [bottomOffsetVar]: withUnit(bottomOffset, 'px'),
          }),
        }}
        {...attrs}
      >
        {children}
      </div>
    );
  }
);
