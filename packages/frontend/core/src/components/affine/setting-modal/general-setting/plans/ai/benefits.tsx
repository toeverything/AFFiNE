import { useI18n } from '@affine/i18n';
import {
  CheckBoxCheckLinearIcon,
  PenIcon,
  TextIcon,
} from '@blocksuite/icons/rc';
import { useMemo } from 'react';

import * as styles from './ai-plan.css';

const benefitsGetter = (t: ReturnType<typeof useI18n>) => [
  {
    name: t['com.affine.payment.ai.benefit.g1'](),
    icon: <TextIcon />,
    items: [
      t['com.affine.payment.ai.benefit.g1-1'](),
      t['com.affine.payment.ai.benefit.g1-2'](),
      t['com.affine.payment.ai.benefit.g1-3'](),
    ],
  },
  {
    name: t['com.affine.payment.ai.benefit.g2'](),
    icon: <PenIcon />,
    items: [
      t['com.affine.payment.ai.benefit.g2-1'](),
      t['com.affine.payment.ai.benefit.g2-2'](),
      t['com.affine.payment.ai.benefit.g2-3'](),
    ],
  },
  {
    name: t['com.affine.payment.ai.benefit.g3'](),
    icon: <CheckBoxCheckLinearIcon />,
    items: [
      t['com.affine.payment.ai.benefit.g3-1'](),
      t['com.affine.payment.ai.benefit.g3-2'](),
      t['com.affine.payment.ai.benefit.g3-3'](),
    ],
  },
];

export const AIBenefits = () => {
  const t = useI18n();
  const benefits = useMemo(() => benefitsGetter(t), [t]);
  return (
    <div className={styles.benefits}>
      {benefits.map(({ name, icon, items }) => {
        return (
          <div key={name} className={styles.benefitGroup}>
            <div className={styles.benefitTitle}>
              {icon}
              {name}
            </div>

            <ul className={styles.benefitList}>
              {items.map(item => (
                <li className={styles.benefitItem} key={item}>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};
