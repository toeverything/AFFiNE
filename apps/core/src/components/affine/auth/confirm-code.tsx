import {
  AuthCode,
  AuthContent,
  ModalHeader,
} from '@affine/component/auth-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { type FC, useCallback, useState } from 'react';

import type { AuthPanelProps } from './index';

export const ConfirmCode: FC<AuthPanelProps> = ({ currentEmail }) => {
  const t = useAFFiNEI18N();
  const [isErrorCode, setIsErrorCode] = useState(false);

  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.up']()}
        subTitle={t['com.affine.auth.email.confirm']()}
      />
      <AuthContent>
        {t['com.affine.auth.sign.confirm.message']()}
        <a href={`mailto:${currentEmail}`}>{currentEmail}</a>
      </AuthContent>
      <AuthCode
        style={{ marginTop: '30px' }}
        error={isErrorCode}
        onComplete={useCallback((code: string) => {
          console.log('code', code);
          setIsErrorCode(code !== '123456');
        }, [])}
      />
    </>
  );
};
