import { IconButton, Modal } from '@affine/component';
import { EditIcon } from '@blocksuite/icons';
import { useState } from 'react';

import type { User } from '../types';
import * as styles from './index.css';
import { UserInfoCard } from './user-info-card';

export const UpdateUser = ({ user }: { user: User }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <IconButton
        onClick={() => {
          setOpen(true);
        }}
      >
        <EditIcon />
      </IconButton>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={'User Info'}
        contentOptions={{
          className: styles.userInfoModal,
        }}
      >
        <UserInfoCard user={user} />
      </Modal>
    </>
  );
};
