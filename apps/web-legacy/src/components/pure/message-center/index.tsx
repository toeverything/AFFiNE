import { MessageCode, Messages } from '@affine/env/constant';
import { setLoginStorage, SignMethod } from '@affine/workspace/affine/login';
import type React from 'react';
import { memo, useEffect, useState } from 'react';

import { affineAuth } from '../../../hooks/affine/use-affine-log-in';
import { useAffineLogOut } from '../../../hooks/affine/use-affine-log-out';
import { toast } from '../../../utils';

declare global {
  interface DocumentEventMap {
    'affine-error': CustomEvent<{
      code: MessageCode;
    }>;
  }
}

export const MessageCenter: React.FC = memo(function MessageCenter() {
  const [popup, setPopup] = useState(false);
  const onLogout = useAffineLogOut();
  useEffect(() => {
    const listener = (
      event: CustomEvent<{
        code: MessageCode;
      }>
    ) => {
      // fixme: need refactor
      //  - login and refresh refresh logic should be refactored
      //  - error message should be refactored
      if (
        !popup &&
        (event.detail.code === MessageCode.refreshTokenError ||
          event.detail.code === MessageCode.loginError)
      ) {
        setPopup(true);
        affineAuth
          .generateToken(SignMethod.Google)
          .then(response => {
            if (response) {
              setLoginStorage(response);
            }
            setPopup(false);
          })
          .catch(() => {
            setPopup(false);
            onLogout();
          });
      } else {
        toast(Messages[event.detail.code].message);
      }
    };

    document.addEventListener('affine-error', listener);
    return () => {
      document.removeEventListener('affine-error', listener);
    };
  }, [onLogout, popup]);
  return null;
});
