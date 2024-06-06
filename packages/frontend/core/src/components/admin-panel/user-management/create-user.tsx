import { Button, Modal, notify } from '@affine/component';
import { AuthInput } from '@affine/component/auth-components';
import { AuthService } from '@affine/core/modules/cloud';
import { emailRegex } from '@affine/core/utils/email-regex';
import { useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { useCreateUser } from '../hooks';
import * as styles from './index.css';

export const CreateUser = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { trigger } = useCreateUser();
  const [open, setOpen] = useState(false);
  const [isValidEmail, setIsValidEmail] = useState(true);
  const authService = useService(AuthService);

  const handleChangeName = useCallback((value: string) => {
    setName(value);
  }, []);

  const handleCheckValidEmail = useCallback(() => {
    if (!emailRegex.test(email)) {
      setIsValidEmail(false);
      return;
    }
    setIsValidEmail(true);
  }, [email]);

  const handleChangeEmail = useCallback(
    (value: string) => {
      handleCheckValidEmail();
      setEmail(value);
    },
    [handleCheckValidEmail]
  );

  const handleChangePassword = useCallback((value: string) => {
    setPassword(value);
  }, []);

  const handleClear = useCallback(() => {
    setName('');
    setEmail('');
    setPassword('');
    setIsValidEmail(true);
  }, []);
  const onOpenChange = useCallback(
    (value: boolean) => {
      setOpen(value);
      handleClear();
    },
    [handleClear]
  );

  const onConfirm = useCallback(() => {
    authService
      .checkUserByEmail(email)
      .then(res => {
        if (res.isExist) {
          notify.error({
            title: 'This email address is already in use',
            message: 'Please change another email address',
          });
          return;
        }
        if (!emailRegex.test(email)) {
          setIsValidEmail(false);
          notify.error({
            title: 'This email address is invalid',
            message: 'Please fill in a valid email address',
          });
          return;
        }
        if (!email) {
          return;
        }
        trigger({ name, email, password });
        handleClear();
        notify.success({
          title: 'User created successfully',
          message: `The user: ${email} has been created successfully.`,
        });
        setOpen(false);
        return;
      })
      .catch(e => {
        notify.error({
          title: 'Failed to create user',
          message: 'Failed to create user, please try again later.',
        });
        console.error(e);
      });
  }, [authService, email, handleClear, name, password, trigger]);

  const handleClick = useCallback(() => {
    setOpen(true);
  }, []);

  const onClose = useCallback(() => {
    setOpen(false);
    handleClear();
  }, [handleClear]);

  return (
    <>
      <Button type="primary" onClick={handleClick}>
        Create
      </Button>
      <Modal
        width={400}
        open={open}
        onOpenChange={onOpenChange}
        title="Create User"
        description="Input user information to create a new user."
      >
        <div className={styles.inputContent}>
          <AuthInput
            label="Name (optional)"
            placeholder="Name"
            value={name}
            onChange={handleChangeName}
          />
          <AuthInput
            autoFocus
            label="Email"
            placeholder="Email"
            value={email}
            onChange={handleChangeEmail}
            onBlur={handleCheckValidEmail}
            error={!isValidEmail}
            errorHint={isValidEmail ? '' : 'Email is invalid or already exist'}
          />
          <AuthInput
            label="Password (optional)"
            placeholder="Password"
            value={password}
            onChange={handleChangePassword}
            type="password"
          />
        </div>

        <div className={styles.modalFooter}>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="primary"
            onClick={onConfirm}
            disabled={!isValidEmail || email.length === 0}
          >
            Create
          </Button>
        </div>
      </Modal>
    </>
  );
};
