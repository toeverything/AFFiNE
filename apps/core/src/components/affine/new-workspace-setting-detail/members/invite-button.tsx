import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useCallback, useState } from 'react';
import {
  Modal,
  ModalCloseButton,
  ModalWrapper,
  Input,
} from '@affine/component';
import { Button } from '@toeverything/components/button';
import * as styles from './styles.css';
import { Permission } from '@affine/graphql';
export const InviteMemberButton = () => {
  const t = useAFFiNEI18N();
  const [open, setOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [permission, setPermission] = useState(Permission.Write);
  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);
  const openModal = useCallback(() => {
    setOpen(true);
  }, []);
  // const onClickInvite = useCallback(async () => {
  //   const emailRegex = new RegExp(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  //   if (!emailRegex.test(inviteEmail)) {
  //     toast('Invalid email');
  //     return;
  //   }
  //
  //   await invite(
  //     inviteEmail,
  //     permission,
  //     // send invite email
  //     true
  //   );
  // }, [inviteEmail, invite, permission]);
  return (
    <>
      <Button onClick={openModal}>{t['Invite Members']()}</Button>
      <Modal
        open={open}
        onClose={handleClose}
        wrapperPosition={['center', 'center']}
        data-testid="invite-modal"
      >
        <ModalWrapper
          width={480}
          height={254}
          style={{
            padding: '20px 26px',
          }}
        >
          <ModalCloseButton top={20} right={20} onClick={handleClose} />

          <div className={styles.inviteModalTitle}>{t['Invite Members']()}</div>
          <div className={styles.inviteModalContent}>
            {t['Invite Members Message']()}
            {/*TODO: check email & add placeholder*/}
            <Input
              data-testid="invite-by-email-input"
              placeholder="email@example.com"
              onChange={setInviteEmail}
              style={{ marginTop: 20 }}
            />
          </div>
          <div className={styles.inviteModalButtonContainer}>
            <Button style={{ marginRight: 20 }}>{t['Cancel']()}</Button>
            <Button type="primary">{t['Invite']()}</Button>
          </div>
        </ModalWrapper>
      </Modal>
    </>
  );
};
