import { useAFFiNEI18N } from '@affine/i18n/hooks';
import clsx from 'clsx';
import { type FC, useMemo } from 'react';

import type { Status } from './index';
import { tag } from './style.css';
export const Tag: FC<{ status: Status }> = ({ status }) => {
  const t = useAFFiNEI18N();

  const textMap = useMemo<{ [K in Status]: string }>(() => {
    return {
      weak: 'Weak',
      medium: 'Medium',
      strong: 'Strong',
      minimum: t['com.affine.auth.set.password.minlength'](),
      maximum: t['com.affine.auth.set.password.maxlength'](),
    };
  }, []);

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
