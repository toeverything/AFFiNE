import { Avatar } from '@affine/component';
import type { Member } from '@affine/core/modules/permissions';
import { useCallback } from 'react';

import * as styles from './member-item.css';

export const MemberItem = ({
  member,
  onSelect,
}: {
  member: Member;
  onSelect: (item: Member) => void;
}) => {
  const handleSelect = useCallback(() => {
    onSelect(member);
  }, [member, onSelect]);
  return (
    <div className={styles.memberItemStyle} onClick={handleSelect}>
      <div className={styles.memberContainerStyle}>
        <Avatar
          key={member.id}
          url={member.avatarUrl || ''}
          name={member.name || ''}
          size={36}
        />
        <div className={styles.memberInfoStyle}>
          <div className={styles.memberNameStyle}>{member.name}</div>
          <div className={styles.memberEmailStyle}>{member.email}</div>
        </div>
      </div>
    </div>
  );
};
