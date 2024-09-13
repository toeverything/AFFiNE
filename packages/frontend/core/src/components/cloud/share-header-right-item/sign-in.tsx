import { Button } from '@affine/component/ui/button';
import { authAtom } from '@affine/core/components/atoms';
import { useI18n } from '@affine/i18n';
import { useSetAtom } from 'jotai';
import { useCallback } from 'react';

import * as styles from './styles.css';

export const SignIn = () => {
  const setOpen = useSetAtom(authAtom);

  const t = useI18n();

  const onClickSignIn = useCallback(() => {
    setOpen(state => ({
      ...state,
      openModal: true,
    }));
  }, [setOpen]);

  return (
    <Button
      className={styles.editButton}
      onClick={onClickSignIn}
      data-testid="share-page-sign-in-button"
    >
      {t['com.affine.share-page.header.login']()}
    </Button>
  );
};
