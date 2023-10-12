import { Turnstile } from '@marsidev/react-turnstile';
import { useCallback, useState } from 'react';

import * as style from './style.css';

export const useCaptcha = (): [string | null, () => JSX.Element] => {
  const [verifyToken, setVerifyToken] = useState<string | null>(null);

  const Captcha = useCallback(() => {
    return (
      <Turnstile
        className={style.captchaWrapper}
        siteKey={process.env.CAPTCHA_SITE_KEY || '1x00000000000000000000AA'}
        onSuccess={setVerifyToken}
      />
    );
  }, []);

  return [verifyToken, Captcha];
};
