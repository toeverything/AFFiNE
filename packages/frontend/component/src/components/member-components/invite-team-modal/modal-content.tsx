import type {
  InviteLink,
  WorkspaceInviteLinkExpireTime,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { EmailIcon, LinkIcon } from '@blocksuite/icons/rc';

import { RadioGroup } from '../../../ui/radio';
import { EmailInvite } from './email-invite';
import { LinkInvite } from './link-invite';
import * as styles from './styles.css';

export type InviteMethodType = 'email' | 'link';
export const ModalContent = ({
  inviteEmail,
  setInviteEmail,
  inviteMethod,
  onInviteMethodChange,
  handleConfirm,
  isMutating,
  isValidEmail,
  copyTextToClipboard,
  onGenerateInviteLink,
  onRevokeInviteLink,
  importCSV,
  invitationLink,
}: {
  inviteEmail: string;
  importCSV: React.ReactNode;
  invitationLink: InviteLink | null;
  setInviteEmail: (value: string) => void;
  inviteMethod: InviteMethodType;
  onInviteMethodChange: (value: InviteMethodType) => void;
  handleConfirm: () => void;
  isMutating: boolean;
  isValidEmail: boolean;
  copyTextToClipboard: (text: string) => Promise<boolean>;
  onGenerateInviteLink: (
    expireTime: WorkspaceInviteLinkExpireTime
  ) => Promise<string>;
  onRevokeInviteLink: () => Promise<boolean>;
}) => {
  const t = useI18n();

  return (
    <div className={styles.modalContent}>
      <div>{t['com.affine.payment.member.team.invite.description']()}</div>
      <RadioGroup
        width={'100%'}
        value={inviteMethod}
        onChange={onInviteMethodChange}
        items={[
          {
            label: (
              <RadioItem
                icon={<EmailIcon className={styles.iconStyle} />}
                label={t[
                  'com.affine.payment.member.team.invite.email-invite'
                ]()}
              />
            ),
            value: 'email',
          },
          {
            label: (
              <RadioItem
                icon={<LinkIcon className={styles.iconStyle} />}
                label={t['com.affine.payment.member.team.invite.invite-link']()}
              />
            ),
            value: 'link',
          },
        ]}
      />
      {inviteMethod === 'email' ? (
        <EmailInvite
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          handleConfirm={handleConfirm}
          isMutating={isMutating}
          isValidEmail={isValidEmail}
          importCSV={importCSV}
        />
      ) : (
        <LinkInvite
          invitationLink={invitationLink}
          copyTextToClipboard={copyTextToClipboard}
          generateInvitationLink={onGenerateInviteLink}
          revokeInvitationLink={onRevokeInviteLink}
        />
      )}
    </div>
  );
};

const RadioItem = ({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) => {
  return (
    <div className={styles.radioItem}>
      {icon}
      <div>{label}</div>
    </div>
  );
};
