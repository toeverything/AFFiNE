import { cssVarV2 } from '@toeverything/theme/v2';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';

import { withUnit } from '../../utils/with-unit';
import { loading, rotateAnimation, speedVar } from './styles.css';

export interface LoadingProps {
  size?: number | string;
  speed?: number;
  strokeColor?: string;
  className?: string;
}

export const Loading = ({
  size,
  speed = 1.2,
  strokeColor = '#273035',
  className,
}: LoadingProps) => {
  const sizeWithUnit = size ? withUnit(size, 'px') : '16px';

  return (
    <svg
      className={clsx(loading, speed !== 0 && rotateAnimation, className)}
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
      <path
        d="M8.93855 4.60897C10.194 4.08892 11.5549 3.89977 12.8925 4.04993C13.5511 4.12387 14.2096 3.75365 14.3812 3.11349C14.6384 2.15325 14.0674 1.15036 13.078 1.05294C11.2869 0.87657 9.47016 1.14159 7.7905 1.83733C5.55335 2.76399 3.68447 4.40294 2.47374 6.5C1.263 8.59706 0.778056 11.035 1.09412 13.4358C1.41019 15.8366 2.5096 18.0659 4.22184 19.7782C5.93408 21.4904 8.16347 22.5898 10.5642 22.9059C12.965 23.222 15.403 22.737 17.5 21.5263C19.5971 20.3155 21.236 18.4467 22.1627 16.2095C22.8584 14.5299 23.1234 12.7131 22.9471 10.922C22.8497 9.93265 21.8468 9.36157 20.8865 9.61887C20.2464 9.7904 19.8762 10.4489 19.9501 11.1075C20.1002 12.4451 19.9111 13.806 19.3911 15.0615C18.7171 16.6885 17.5252 18.0477 16 18.9282C14.4749 19.8087 12.7018 20.1614 10.9558 19.9316C9.2098 19.7017 7.58843 18.9021 6.34316 17.6569C5.09789 16.4116 4.29832 14.7902 4.06846 13.0442C3.83859 11.2982 4.19128 9.52514 5.07181 8C5.95235 6.47487 7.31153 5.2829 8.93855 4.60897Z"
        fill={strokeColor || cssVarV2.loading.foreground}
      />
    </svg>
  );
};
