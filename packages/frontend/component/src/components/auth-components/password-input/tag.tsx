import clsx from 'clsx';
import { type FC, useMemo } from 'react';

import type { Status } from './index';
import { tag } from './style.css';
export const Tag: FC<{ status: Status }> = ({ status }) => {
  const textMap = useMemo<{ [K in Status]: string }>(() => {
    return {
      weak: 'Weak',
      medium: 'Medium',
      strong: 'Strong',
      maximum: 'Maximum',
    };
  }, []);

  return (
    <div
      className={clsx(tag, {
        weak: status === 'weak',
        medium: status === 'medium',
        strong: status === 'strong',
        maximum: status === 'maximum',
      })}
    >
      {textMap[status]}
    </div>
  );
};
