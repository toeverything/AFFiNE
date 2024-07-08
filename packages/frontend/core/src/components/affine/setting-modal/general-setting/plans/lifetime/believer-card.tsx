import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

import { bgAFFiNERaw, bgIconsRaw } from './assets';
import { bg, card, content } from './believer-card.css';

export const BelieverCard = ({
  children,
  type,
  className,
  ...attrs
}: HTMLAttributes<HTMLDivElement> & {
  type: 1 | 2;
}) => {
  return (
    <div className={clsx(card, className)} data-type={type} {...attrs}>
      <div
        className={bg}
        dangerouslySetInnerHTML={{ __html: `${bgAFFiNERaw}${bgIconsRaw}` }}
      />
      <div className={content}>{children}</div>
    </div>
  );
};
