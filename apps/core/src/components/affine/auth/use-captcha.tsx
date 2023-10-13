import { Turnstile } from '@marsidev/react-turnstile';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from 'react';

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

export const useChallenge = (): [
  string | null,
  Dispatch<SetStateAction<string | null>>,
] => {
  const [response, setResponse] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<string | null>(null);

  useEffect(() => {
    const generateChallenge = async () => {
      if (!challenge) return;
      const response = await window.apis?.ui?.getChallengeResponse(challenge);
      setResponse(response);
    };

    if (environment.isDesktop) {
      generateChallenge();
    }
  }, [challenge]);

  return [response, setChallenge];
};
