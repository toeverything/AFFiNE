import {
  type InviteLink,
  WorkspaceInviteLinkExpireTime,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { CloseIcon } from '@blocksuite/icons/rc';
import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useCallback, useMemo, useState } from 'react';

import { Button, IconButton } from '../../../ui/button';
import Input from '../../../ui/input';
import { Menu, MenuItem, MenuTrigger } from '../../../ui/menu';
import { notify } from '../../../ui/notification';
import * as styles from './styles.css';

const getMenuItems = (t: ReturnType<typeof useI18n>) => [
  {
    label: t['com.affine.payment.member.team.invite.expiration-date']({
      number: '1',
    }),
    value: WorkspaceInviteLinkExpireTime.OneDay,
  },
  {
    label: t['com.affine.payment.member.team.invite.expiration-date']({
      number: '3',
    }),
    value: WorkspaceInviteLinkExpireTime.ThreeDays,
  },
  {
    label: t['com.affine.payment.member.team.invite.expiration-date']({
      number: '7',
    }),
    value: WorkspaceInviteLinkExpireTime.OneWeek,
  },
  {
    label: t['com.affine.payment.member.team.invite.expiration-date']({
      number: '30',
    }),
    value: WorkspaceInviteLinkExpireTime.OneMonth,
  },
];

export const LinkInvite = ({
  invitationLink,
  copyTextToClipboard,
  generateInvitationLink,
  revokeInvitationLink,
}: {
  invitationLink: InviteLink | null;
  generateInvitationLink: (
    expireTime: WorkspaceInviteLinkExpireTime
  ) => Promise<string>;
  revokeInvitationLink: () => Promise<boolean>;
  copyTextToClipboard: (text: string) => Promise<boolean>;
}) => {
  const t = useI18n();
  const [selectedValue, setSelectedValue] = useState(
    WorkspaceInviteLinkExpireTime.OneWeek
  );
  const menuItems = getMenuItems(t);
  const items = useMemo(() => {
    return menuItems.map(item => (
      <MenuItem key={item.value} onSelect={() => setSelectedValue(item.value)}>
        {item.label}
      </MenuItem>
    ));
  }, [menuItems]);

  const currentSelectedLabel = useMemo(
    () => menuItems.find(item => item.value === selectedValue)?.label,
    [menuItems, selectedValue]
  );

  const onGenerate = useCallback(() => {
    generateInvitationLink(selectedValue).catch(err => {
      console.error('Failed to generate invitation link: ', err);
      notify.error({
        title: 'Failed to generate invitation link',
        message: err.message,
      });
    });
  }, [generateInvitationLink, selectedValue]);

  const onCopy = useCallback(() => {
    if (!invitationLink) {
      return;
    }
    copyTextToClipboard(invitationLink.link)
      .then(() =>
        notify.success({
          title: t['Copied link to clipboard'](),
        })
      )
      .catch(err => {
        console.error('Failed to copy text: ', err);
        notify.error({
          title: 'Failed to copy link to clipboard',
          message: err.message,
        });
      });
  }, [copyTextToClipboard, invitationLink, t]);

  const onReset = useCallback(() => {
    revokeInvitationLink().catch(err => {
      console.error('Failed to revoke invitation link: ', err);
      notify.error({
        title: 'Failed to revoke invitation link',
        message: err.message,
      });
    });
  }, [revokeInvitationLink]);

  const expireTime = useMemo(() => {
    return t['com.affine.payment.member.team.invite.expire-at']({
      expireTime: invitationLink?.expireTime
        ? new Date(invitationLink.expireTime).toLocaleString()
        : '',
    });
  }, [invitationLink, t]);

  return (
    <>
      <div className={styles.invitationLinkContainer}>
        <div className={styles.modalSubTitle}>
          {t['com.affine.payment.member.team.invite.link-expiration']()}
        </div>
        {invitationLink ? (
          <Input
            value={expireTime}
            disabled
            style={{
              backgroundColor: cssVarV2('input/background'),
            }}
          />
        ) : (
          <Menu
            items={items}
            contentOptions={{
              style: {
                width: 'var(--radix-dropdown-menu-trigger-width)',
              },
            }}
          >
            <MenuTrigger style={{ width: '100%' }}>
              {currentSelectedLabel}
            </MenuTrigger>
          </Menu>
        )}
      </div>
      <div className={styles.invitationLinkContainer}>
        <div className={styles.modalSubTitle}>
          {t['com.affine.payment.member.team.invite.invitation-link']()}
        </div>
        <div className={styles.invitationLinkContent}>
          <Input
            value={
              invitationLink
                ? invitationLink.link
                : 'https://your-app.com/invite/xxxxxxxx'
            }
            inputMode="none"
            disabled
            inputStyle={{
              fontSize: cssVar('fontXs'),
              color: cssVarV2(
                invitationLink ? 'text/primary' : 'text/placeholder'
              ),
              backgroundColor: cssVarV2('layer/background/primary'),
            }}
          />
          {invitationLink ? (
            <>
              <Button onClick={onCopy} variant="secondary">
                {t['com.affine.payment.member.team.invite.copy']()}
              </Button>
              <IconButton icon={<CloseIcon />} onClick={onReset} />
            </>
          ) : (
            <Button onClick={onGenerate} variant="secondary">
              {t['com.affine.payment.member.team.invite.generate']()}
            </Button>
          )}
        </div>
        <p className={styles.invitationLinkDescription}>
          {t[
            'com.affine.payment.member.team.invite.invitation-link.description'
          ]()}
        </p>
      </div>
    </>
  );
};
