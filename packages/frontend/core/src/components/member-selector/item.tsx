import { Avatar, Skeleton } from '@affine/component';
import { PublicUserService } from '@affine/core/modules/cloud';
import { useI18n } from '@affine/i18n';
import { CloseIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { type MouseEventHandler, useCallback, useEffect } from 'react';

import * as styles from './styles.css';

export interface MemberItemProps {
  userId: string;
  idx?: number;
  maxWidth?: number | string;
  focused?: boolean;
  onRemove?: () => void;
  style?: React.CSSProperties;
}

export const MemberItem = ({
  userId,
  idx,
  focused,
  onRemove,
  style,
  maxWidth,
}: MemberItemProps) => {
  const t = useI18n();
  const handleRemove: MouseEventHandler<HTMLDivElement> = useCallback(
    e => {
      e.stopPropagation();
      onRemove?.();
    },
    [onRemove]
  );

  const publicUserService = useService(PublicUserService);
  const member = useLiveData(publicUserService.publicUser$(userId));
  const isLoading = useLiveData(publicUserService.isLoading$(userId));
  useEffect(() => {
    if (userId) {
      publicUserService.revalidate(userId);
    }
  }, [userId, publicUserService]);

  if (!member || ('removed' in member && member.removed)) {
    return (
      <div className={styles.memberItem} data-idx={idx} style={style}>
        <div
          style={{ maxWidth: maxWidth }}
          data-focused={focused}
          className={styles.memberItemInlineMode}
        >
          <div className={styles.memberItemLabel}>
            {!isLoading ? (
              <span>
                <Skeleton width="12px" height="12px" variant="circular" />
                <Skeleton width="3em" />
              </span>
            ) : (
              t['Unknown User']()
            )}
          </div>
          {onRemove ? (
            <div
              data-testid="remove-tag-button"
              className={styles.memberItemRemove}
              onClick={handleRemove}
            >
              <CloseIcon />
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  const { name, avatarUrl } = member;

  return (
    <div
      className={styles.memberItem}
      data-idx={idx}
      title={name ?? undefined}
      style={style}
    >
      <div
        style={{ maxWidth: maxWidth }}
        data-focused={focused}
        className={styles.memberItemInlineMode}
      >
        <Avatar
          url={avatarUrl}
          name={name ?? ''}
          size={16}
          className={styles.memberItemAvatar}
        />
        <div className={styles.memberItemLabel}>{name}</div>
        {onRemove ? (
          <div
            data-testid="remove-tag-button"
            className={styles.memberItemRemove}
            onClick={handleRemove}
          >
            <CloseIcon />
          </div>
        ) : null}
      </div>
    </div>
  );
};
