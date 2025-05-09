import { CaptchaService } from '@affine/core/modules/cloud';
import { Turnstile } from '@marsidev/react-turnstile';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';

import * as style from './style.css';

export const Captcha = () => {
  const captchaService = useService(CaptchaService);
  const hasCaptchaFeature = useLiveData(captchaService.needCaptcha$);
  const isLoading = useLiveData(captchaService.isLoading$);
  const verifyToken = useLiveData(captchaService.verifyToken$);
  useEffect(() => {
    captchaService.revalidate();
  }, [captchaService]);

  const handleTurnstileSuccess = useCallback(
    (token: string) => {
      captchaService.verifyToken$.next(token);
    },
    [captchaService]
  );

  if (!hasCaptchaFeature) {
    return null;
  }

  if (isLoading) {
    return <div className={style.captchaWrapper}>Loading...</div>;
  }

  if (verifyToken) {
    return <div className={style.captchaWrapper}>Verified Client</div>;
  }

  return (
    <Turnstile
      className={style.captchaWrapper}
      siteKey={BUILD_CONFIG.CAPTCHA_SITE_KEY || '1x00000000000000000000AA'}
      onSuccess={handleTurnstileSuccess}
    />
  );
};
