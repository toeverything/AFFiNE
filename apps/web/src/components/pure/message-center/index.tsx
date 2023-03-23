import { toast } from '@affine/component';
import { MessageCode } from '@affine/datacenter';
import { messages } from '@affine/datacenter';
import type React from 'react';
import { memo, useEffect, useState } from 'react';

import { useOnGoogleLogout } from '../../../hooks/use-on-google-logout';
import { apis } from '../../../shared/apis';

declare global {
  interface DocumentEventMap {
    'affine-error': CustomEvent<{
      code: MessageCode;
    }>;
  }
}

export const MessageCenter: React.FC = memo(function MessageCenter() {
  const [popup, setPopup] = useState(false);
  const onLogout = useOnGoogleLogout();
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
        apis
          .signInWithGoogle()
          .then(() => {
            setPopup(false);
          })
          .catch(() => {
            setPopup(false);
            onLogout();
          });
      } else {
        toast(messages[event.detail.code].message);
      }
    };

    document.addEventListener('affine-error', listener);
    return () => {
      document.removeEventListener('affine-error', listener);
    };
  }, [onLogout, popup]);
  return null;
});
