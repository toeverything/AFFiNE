import clsx from 'clsx';
import type { HTMLAttributes } from 'react';

import { MemberItem } from './item';
import * as styles from './styles.css';

interface InlineMemberListProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'onChange'
> {
  members: string[];
  focusedIndex?: number;
  onRemove?: (id: string) => void;
}

export const InlineMemberList = ({
  className,
  children,
  members,
  focusedIndex,
  onRemove,
  ...props
}: InlineMemberListProps) => {
  return (
    <div className={clsx(styles.inlineMemberList, className)} {...props}>
      {members.map((member, idx) => (
        <MemberItem
          key={member}
          userId={member}
          focused={focusedIndex === idx}
          onRemove={onRemove ? () => onRemove(member) : undefined}
        />
      ))}
      {children}
    </div>
  );
};
