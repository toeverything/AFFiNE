import { Modal } from '@affine/component';
import type { SignInStep } from '@affine/core/components/sign-in';
import type {
  DialogComponentProps,
  GLOBAL_DIALOG_SCHEMA,
} from '@affine/core/modules/dialogs';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useEffect, useRef, useState } from 'react';

import { MobileSignInPanel } from '../../components/sign-in';

declare global {
  interface Window {
    showNativeSignIn?: () => Promise<string | null>;
  }
}

export const SignInDialog = ({
  close,
  server: initialServerBaseUrl,
  step,
}: DialogComponentProps<GLOBAL_DIALOG_SCHEMA['sign-in']>) => {
  const shouldUseNativeSignIn = step !== 'addSelfhosted';
  const [useWebFallback, setUseWebFallback] = useState(!shouldUseNativeSignIn);
  const didRequestNativeSignIn = useRef(false);
  const closeRef = useRef(close);

  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    if (
      !shouldUseNativeSignIn ||
      useWebFallback ||
      didRequestNativeSignIn.current
    ) {
      return;
    }

    const showNativeSignIn = window.showNativeSignIn;
    if (typeof showNativeSignIn !== 'function') {
      setUseWebFallback(true);
      return;
    }

    didRequestNativeSignIn.current = true;
    let isActive = true;
    showNativeSignIn()
      .then(accountId => {
        if (!isActive) {
          return;
        }
        if (accountId) {
          closeRef.current();
          return;
        }
        closeRef.current();
      })
      .catch((error: unknown) => {
        console.error('Failed to show native sign-in', error);
        if (isActive) {
          setUseWebFallback(true);
        }
      });

    return () => {
      isActive = false;
    };
  }, [shouldUseNativeSignIn, useWebFallback]);

  if (!useWebFallback) {
    return null;
  }

  return (
    <Modal
      fullScreen
      animation="slideBottom"
      open
      onOpenChange={() => close()}
      contentOptions={{
        style: {
          padding: 0,
          overflowY: 'auto',
          backgroundColor: cssVarV2('layer/background/secondary'),
        },
      }}
      withoutCloseButton
    >
      <MobileSignInPanel
        onClose={close}
        server={initialServerBaseUrl}
        initStep={step as SignInStep}
        showCloseButton
      />
    </Modal>
  );
};
