import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';

import { withUnit } from '../../utils/with-unit';
import { loading, rotateAnimation, speedVar } from './styles.css';

export interface LoadingProps {
  size?: number | string;
  speed?: number;
  progress?: number;
}

export const Loading = ({
  size,
  speed = 1.2,
  progress = 0.2,
}: LoadingProps) => {
  // allow `string` such as `16px` | `100%` | `1em`
  const sizeWithUnit = size ? withUnit(size, 'px') : '16px';
  return (
    <svg
      className={clsx(loading, speed !== 0 && rotateAnimation)}
      width={sizeWithUnit}
      height={sizeWithUnit}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        ...assignInlineVars({
          [speedVar]: `${speed}s`,
        }),
      }}
    >
      <circle
        cx={12}
        cy={12}
        r={8}
        strokeWidth={4}
        stroke="var(--affine-black-10)"
      />
      <circle
        cx={12}
        cy={12}
        r={8}
        strokeWidth={4}
        stroke="var(--affine-primary-color)"
        strokeDasharray={`${2 * Math.PI * 8 * progress} ${
          2 * Math.PI * 8 * (1 - progress)
        }`}
      />
    </svg>
  );
};
