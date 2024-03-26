import clsx from 'clsx';
import type { FC } from 'react';
import { useMemo } from 'react';

import type { Status } from './index';
import { tag } from './style.css';

type TagProps = {
  status: Status;
  minimum: string;
  maximum: string;
};

export const Tag: FC<TagProps> = ({ status, minimum, maximum }) => {
  const textMap = useMemo<{ [K in Status]: string }>(() => {
    return {
      weak: 'Weak',
      medium: 'Medium',
      strong: 'Strong',
      minimum,
      maximum,
    };
  }, [minimum, maximum]);

  return (
    <div
      className={clsx(tag, {
        weak: status === 'weak',
        medium: status === 'medium',
        strong: status === 'strong',
        minimum: status === 'minimum',
        maximum: status === 'maximum',
      })}
    >
      {textMap[status]}
    </div>
  );
};
