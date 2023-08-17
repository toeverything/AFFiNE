import { Permission } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { useCallback, useEffect, useState } from 'react';

import { Menu, MenuItem, MenuTrigger } from '../../ui/menu';
import { Modal, ModalCloseButton, ModalWrapper } from '../../ui/modal';
import { AuthInput } from '..//auth-components';
import { emailRegex } from '..//auth-components/utils';
import * as styles from './styles.css';

export interface InviteModalProps {
  open: boolean;
  setOpen: (value: boolean) => void;
  onConfirm: (params: { email: string; permission: Permission }) => void;
}

const PermissionMenu = ({
  currentPermission,
  onChange,
}: {
  currentPermission: Permission;
  onChange: (permission: Permission) => void;
}) => {
  return (
    <Menu
      trigger="click"
      content={
        <>
          {Object.entries(Permission).map(([permission]) => {
            return (
              <MenuItem
                key={permission}
                onClick={() => {
                  onChange(permission as Permission);
                }}
              >
                {permission}
              </MenuItem>
            );
          })}
        </>
      }
    >
      <MenuTrigger
        type="plain"
        style={{
          marginRight: -10,
          height: '100%',
        }}
      >
        {currentPermission}
      </MenuTrigger>
    </Menu>
  );
};

export const InviteModal = ({ open, setOpen, onConfirm }: InviteModalProps) => {
  const t = useAFFiNEI18N();
  const [inviteEmail, setInviteEmail] = useState('');
  const [permission, setPermission] = useState(Permission.Write);
  const [isValidEmail, setIsValidEmail] = useState(true);

  const handleCancel = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const handleConfirm = useCallback(() => {
    if (!emailRegex.test(inviteEmail)) {
      setIsValidEmail(false);
      return;
    }

    onConfirm({
      email: inviteEmail,
      permission,
    });
  }, [inviteEmail, onConfirm, permission]);

  useEffect(() => {
    if (!open) {
      setInviteEmail('');
    }
  }, [open]);

  return (
    <Modal
      wrapperPosition={['center', 'center']}
      data-testid="invite-modal"
      open={open}
    >
      <ModalWrapper
        width={480}
        height={254}
        style={{
          padding: '20px 26px',
        }}
      >
        <ModalCloseButton top={20} right={20} onClick={handleCancel} />

        <div className={styles.inviteModalTitle}>{t['Invite Members']()}</div>
        <div className={styles.inviteModalContent}>
          {t['Invite Members Message']()}
          {/*TODO: check email & add placeholder*/}
          <AuthInput
            placeholder="email@example.com"
            value={inviteEmail}
            onChange={setInviteEmail}
            error={!isValidEmail}
            errorHint={
              isValidEmail ? '' : t['com.affine.auth.sign.email.error']()
            }
            onEnter={handleConfirm}
            style={{ marginTop: 20 }}
            size="large"
            endFix={
              <PermissionMenu
                currentPermission={permission}
                onChange={setPermission}
              />
            }
          />
        </div>
        <div className={styles.inviteModalButtonContainer}>
          <Button style={{ marginRight: 20 }} onClick={handleCancel}>
            {t['Cancel']()}
          </Button>
          <Button type="primary" onClick={handleConfirm}>
            {t['Invite']()}
          </Button>
        </div>
      </ModalWrapper>
    </Modal>
  );
};
