import clsx from 'clsx';

import * as styles from './index.css';
import type { SkeletonProps } from './types';

function getSize(size: number | string) {
  return typeof size === 'number' || /^\d+$/.test(size) ? `${size}px` : size;
}

/**
 *
 * @returns
 */
export const Skeleton = ({
  animation = 'pulse',
  variant = 'text',
  children,

  flex,
  width: _width,
  height: _height,
  style: _style,
  className: _className,

  ...props
}: SkeletonProps) => {
  const width = _width !== undefined ? getSize(_width) : undefined;
  const height = _height !== undefined ? getSize(_height) : undefined;

  const style = {
    width,
    height,
    flex,
    ..._style,
  };

  return (
    <div
      className={clsx(
        _className,
        styles.root,
        styles.variant[variant],
        animation && styles.animation[animation]
      )}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
};
