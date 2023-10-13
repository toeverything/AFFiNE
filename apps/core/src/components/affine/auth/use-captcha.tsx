import { fetchWithTraceReport } from '@affine/graphql';
import { Turnstile } from '@marsidev/react-turnstile';
import { useCallback, useState } from 'react';
import useSWR from 'swr';

import * as style from './style.css';

const useCloudflareCaptcha = (): [string | null, () => JSX.Element] => {
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

type Challenge = {
  challenge: string;
  resource: string;
};

const challengeFetcher = async (url: string) => {
  if (!environment.isDesktop) {
    return undefined;
  }

  const res = await fetchWithTraceReport(url);
  if (!res.ok) {
    throw new Error('Failed to fetch challenge');
  }
  const challenge = (await res.json()) as Challenge;
  if (!challenge || !challenge.challenge || !challenge.resource) {
    throw new Error('Invalid challenge');
  }

  return window.apis?.ui?.getChallengeResponse(challenge.challenge);
};

const Challenge = () => {
  return <div style={{ margin: 'auto' }}>Making Challenge...</div>;
};

export const useCaptcha = (): [string | null, () => JSX.Element] => {
  const [verifyToken, Captcha] = useCloudflareCaptcha();
  const { data: response } = useSWR('/api/auth/challenge', challengeFetcher);
  console.log(environment, environment.isDesktop);

  if (environment.isDesktop) {
    console.log('challenge', response);
    return [response || null, Challenge];
  }

  console.log('captcha', verifyToken);
  return [verifyToken, Captcha];
};
