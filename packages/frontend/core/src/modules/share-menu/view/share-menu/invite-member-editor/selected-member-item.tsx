import type { Member } from '@affine/core/modules/permissions';
import { CloseIcon } from '@blocksuite/icons/rc';
import { type MouseEventHandler, useCallback } from 'react';

import * as styles from './selected-member-item.css';

export interface TagItemProps {
  member: Member;
  idx?: number;
  onRemoved?: () => void;
  style?: React.CSSProperties;
}

export const SelectedMemberItem = ({
  member,
  idx,
  onRemoved,
  style,
}: TagItemProps) => {
  const handleRemove: MouseEventHandler<HTMLDivElement> = useCallback(
    e => {
      e.stopPropagation();
      onRemoved?.();
    },
    [onRemoved]
  );
  return (
    <div
      className={styles.member}
      data-idx={idx}
      style={{
        ...style,
      }}
    >
      <div className={styles.memberInnerWrapper}>
        <div className={styles.label}>{member.name}</div>
        {onRemoved ? (
          <div className={styles.remove} onClick={handleRemove}>
            <CloseIcon />
          </div>
        ) : null}
      </div>
    </div>
  );
};
