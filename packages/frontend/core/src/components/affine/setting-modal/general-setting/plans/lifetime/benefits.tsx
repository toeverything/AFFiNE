import { useI18n } from '@affine/i18n';
import { AfFiNeIcon, DoneIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

import { benefits, li } from './benefits.css';

export const BelieverBenefits = ({
  className,
  ...attrs
}: HTMLAttributes<HTMLUListElement>) => {
  const t = useI18n();

  return (
    <ul className={clsx(benefits, className)} {...attrs}>
      <li className={li}>
        <AfFiNeIcon />
        <span>{t['com.affine.payment.lifetime.benefit-1']()}</span>
      </li>

      <li className={li}>
        <DoneIcon />
        <span>{t['com.affine.payment.lifetime.benefit-2']()}</span>
      </li>

      <li className={li}>
        <DoneIcon />
        <span>
          {t['com.affine.payment.lifetime.benefit-3']({
            capacity: '1T',
          })}
        </span>
      </li>
    </ul>
  );
};
