import { Button, IconButton, Input, Modal } from '@affine/component';
import { DeletePermanentlyIcon } from '@blocksuite/icons';
import { useCallback, useState } from 'react';

import { useDeleteUserById } from '../hooks';
import type { User } from '../types';
import * as styles from './index.css';

export const DeleteUser = ({ user }: { user: User }) => {
  const [deleteStr, setDeleteStr] = useState<string>('');
  const { trigger } = useDeleteUserById();
  const allowDelete = deleteStr === user.email;
  const [open, setOpen] = useState(false);

  const handleClick = useCallback(() => {
    setOpen(true);
  }, []);

  const handleDelete = useCallback(() => {
    if (allowDelete) {
      trigger(user.id);
      setOpen(false);
    }
  }, [allowDelete, trigger, user.id]);

  const onOpenChange = useCallback((value: boolean) => {
    setOpen(value);
    setDeleteStr('');
  }, []);

  const handleCancel = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <>
      <IconButton
        type="default"
        className={styles.deleteIcon}
        withoutHoverStyle
        onClick={handleClick}
      >
        <DeletePermanentlyIcon />
      </IconButton>
      <Modal
        title={'Permanently delete user?'}
        description={<Desc name={user.name} email={user.email} />}
        width={480}
        open={open}
        onOpenChange={onOpenChange}
      >
        <div className={styles.inputContent}>
          <Input
            autoFocus
            onChange={setDeleteStr}
            data-testid="delete-workspace-input"
            onEnter={handleDelete}
            placeholder={`Please type the user's email to confirm`}
            size="large"
          />
        </div>
        <div className={styles.modalFooter}>
          <Button onClick={handleCancel}>Cancel</Button>
          <Button type="error" onClick={handleDelete} disabled={!allowDelete}>
            Delete
          </Button>
        </div>
      </Modal>
    </>
  );
};

const Desc = ({ name, email }: { name: string; email: string }) => {
  return (
    <>
      <span>
        Deleting user
        <span className={styles.warning}>{name ? name : email}</span> will
        delete all related data, this operation cannot be undone, please proceed
        with caution.
      </span>
      <br />
      <span>
        User&apos;s email:<span className={styles.warning}>{email}</span>
      </span>
    </>
  );
};
