import { Avatar, Skeleton, Tooltip } from '@affine/component';
import { DocGrantedUsersService } from '@affine/core/modules/permissions';
import { DocRole } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import clsx from 'clsx';
import { useEffect, useMemo } from 'react';

import * as styles from './styles.css';

export { MemberManagement } from './member-management';

export const MembersRow = ({ onClick }: { onClick: () => void }) => {
  const t = useI18n();
  const docGrantedUsersService = useService(DocGrantedUsersService);

  const grantedUserList = useLiveData(docGrantedUsersService.grantedUsers$);
  const grantedUserCount = useLiveData(
    docGrantedUsersService.grantedUserCount$
  );
  const loading = useLiveData(docGrantedUsersService.isLoading$);
  const docOwner = useLiveData(
    docGrantedUsersService.grantedUsers$.map(users =>
      users.find(user => user.role === DocRole.Owner)
    )
  );

  const topThreeMembers = useMemo(
    () =>
      grantedUserList
        ?.slice(0, Math.min(3, grantedUserList.length))
        .map(grantedUser => ({
          name: grantedUser.user.name,
          avatarUrl: grantedUser.user.avatarUrl,
          id: grantedUser.user.id,
        })),
    [grantedUserList]
  );

  const description = useMemo(() => {
    if (!grantedUserCount || !topThreeMembers || topThreeMembers.length <= 1) {
      return '';
    }
    switch (grantedUserCount) {
      case 2:
        return t['com.affine.share-menu.member-management.member-count-2']({
          member1: topThreeMembers[0].name,
          member2: topThreeMembers[1].name,
        });
      case 3:
        return t['com.affine.share-menu.member-management.member-count-3']({
          member1: topThreeMembers[0].name,
          member2: topThreeMembers[1].name,
          member3: topThreeMembers[2].name,
        });
      default:
        return t['com.affine.share-menu.member-management.member-count-more']({
          member1: topThreeMembers[0].name,
          member2: topThreeMembers[1].name,
          memberCount: (grantedUserCount - 2).toString(),
        });
    }
  }, [grantedUserCount, t, topThreeMembers]);

  useEffect(() => {
    docGrantedUsersService.reset();
    docGrantedUsersService.loadMore();
  }, [docGrantedUsersService]);

  if (
    grantedUserCount &&
    topThreeMembers &&
    topThreeMembers.length > 1 &&
    grantedUserCount > 1
  ) {
    return (
      <Tooltip content={description}>
        <div
          className={clsx(styles.rowContainerStyle, 'clickable')}
          onClick={onClick}
        >
          <div className={styles.memberContainerStyle}>
            <div className={styles.avatarsContainerStyle}>
              {topThreeMembers.map((member, index) => (
                <Avatar
                  key={member.id}
                  url={member.avatarUrl || ''}
                  name={member.name || ''}
                  size={24}
                  style={{
                    marginLeft: index === 0 ? 0 : -8,
                    border: `1px solid ${cssVarV2('layer/white')}`,
                  }}
                />
              ))}
            </div>
            <span className={styles.descriptionStyle}>{description}</span>
          </div>
          <div className={styles.IconButtonStyle}>
            <ArrowRightSmallIcon />
          </div>
        </div>
      </Tooltip>
    );
  }

  if (!docOwner && loading) {
    // is loading
    return (
      <div className={styles.rowContainerStyle}>
        <Skeleton />
      </div>
    );
  }

  // TODO(@JimmFly): handle the case when there is only one member
  return (
    <div
      className={clsx(styles.rowContainerStyle, 'clickable')}
      onClick={onClick}
    >
      {docOwner ? (
        <>
          <div className={styles.memberContainerStyle}>
            <Avatar
              url={docOwner.user.avatarUrl || ''}
              name={docOwner.user.name}
              size={24}
            />
            <span title={docOwner.user.name} className={styles.memberNameStyle}>
              {docOwner.user.name}
            </span>
          </div>
          <div className={styles.OwnerStyle}>{t['Owner']()}</div>
        </>
      ) : (
        <div>{t['com.affine.share-menu.invite-editor.manage-members']()}</div>
      )}
      <div className={styles.IconButtonStyle}>
        <ArrowRightSmallIcon />
      </div>
    </div>
  );
};
