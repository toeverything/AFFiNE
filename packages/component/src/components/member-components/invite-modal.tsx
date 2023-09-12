import { Permission } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ConfirmModal } from '@toeverything/components/modal';
import { useCallback, useEffect, useState } from 'react';

import { AuthInput } from '..//auth-components';
import { emailRegex } from '..//auth-components/utils';

export interface InviteModalProps {
  open: boolean;
  setOpen: (value: boolean) => void;
  onConfirm: (params: { email: string; permission: Permission }) => void;
  isMutating: boolean;
}

const PermissionMenu = ({
  currentPermission,
  onChange,
}: {
  currentPermission: Permission;
  onChange: (permission: Permission) => void;
}) => {
  console.log('currentPermission', currentPermission);
  console.log('onChange', onChange);

  return null;
  // return (
  //   <Menu
  //     trigger="click"
  //     content={
  //       <>
  //         {Object.entries(Permission).map(([permission]) => {
  //           return (
  //             <MenuItem
  //               key={permission}
  //               onClick={() => {
  //                 onChange(permission as Permission);
  //               }}
  //             >
  //               {permission}
  //             </MenuItem>
  //           );
  //         })}
  //       </>
  //     }
  //   >
  //     <MenuTrigger
  //       type="plain"
  //       style={{
  //         marginRight: -10,
  //         height: '100%',
  //       }}
  //     >
  //       {currentPermission}
  //     </MenuTrigger>
  //   </Menu>
  // );
};

export const InviteModal = ({
  open,
  setOpen,
  onConfirm,
  isMutating,
}: InviteModalProps) => {
  const t = useAFFiNEI18N();
  const [inviteEmail, setInviteEmail] = useState('');
  const [permission, setPermission] = useState(Permission.Write);
  const [isValidEmail, setIsValidEmail] = useState(true);

  const handleConfirm = useCallback(() => {
    if (!emailRegex.test(inviteEmail)) {
      setIsValidEmail(false);
      return;
    }
    setIsValidEmail(true);

    onConfirm({
      email: inviteEmail,
      permission,
    });
  }, [inviteEmail, onConfirm, permission]);

  useEffect(() => {
    if (!open) {
      setInviteEmail('');
      setIsValidEmail(true);
    }
  }, [open]);

  return (
    <ConfirmModal
      open={open}
      onOpenChange={setOpen}
      width={480}
      title={t['Invite Members']()}
      description={t['Invite Members Message']()}
      cancelText={t['com.affine.inviteModal.button.cancel']()}
      contentOptions={{
        ['data-testid' as string]: 'invite-modal',
        style: {
          padding: '20px 26px',
        },
      }}
      confirmButtonOptions={{
        loading: isMutating,
        type: 'primary',
        ['data-testid' as string]: 'confirm-enable-affine-cloud-button',
        children: t['Invite'](),
      }}
      onConfirm={handleConfirm}
    >
      {/*TODO: check email & add placeholder*/}
      <AuthInput
        disabled={isMutating}
        placeholder="email@example.com"
        value={inviteEmail}
        onChange={setInviteEmail}
        error={!isValidEmail}
        errorHint={isValidEmail ? '' : t['com.affine.auth.sign.email.error']()}
        onEnter={handleConfirm}
        wrapperProps={{
          style: { padding: 0 },
        }}
        size="large"
        endFix={
          <PermissionMenu
            currentPermission={permission}
            onChange={setPermission}
          />
        }
      />
    </ConfirmModal>
  );
};
