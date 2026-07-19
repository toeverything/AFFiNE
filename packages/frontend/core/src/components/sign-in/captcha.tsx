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
  const provider = useLiveData(captchaService.provider$);
  const turnstile = useLiveData(captchaService.turnstile$);
  const error = useLiveData(captchaService.error$);
  useEffect(() => {
    if (hasCaptchaFeature) captchaService.revalidate();
  }, [captchaService, hasCaptchaFeature]);

  const handleTurnstileSuccess = useCallback(
    (token: string) => {
      captchaService.challenge$.next(undefined);
      captchaService.provider$.next('turnstile');
      captchaService.verifyToken$.next(token);
    },
    [captchaService]
  );

  if (!hasCaptchaFeature) {
    return null;
  }

  if (error) {
    return <div className={style.captchaWrapper}>Verification unavailable</div>;
  }

  if (isLoading || !provider) {
    return <div className={style.captchaWrapper}>Loading...</div>;
  }

  if (verifyToken) {
    return <div className={style.captchaWrapper}>Verified Client</div>;
  }

  if (provider !== 'turnstile' || !turnstile) {
    return <div className={style.captchaWrapper}>Verification failed</div>;
  }

  return (
    <Turnstile
      className={style.captchaWrapper}
      siteKey={turnstile.siteKey}
      options={{ action: turnstile.action }}
      onSuccess={handleTurnstileSuccess}
      onExpire={() => captchaService.verifyToken$.next(undefined)}
      onError={() => captchaService.verifyToken$.next(undefined)}
    />
  );
};
