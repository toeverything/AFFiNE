import { fetchWithTraceReport } from '@affine/graphql';
import { Turnstile } from '@marsidev/react-turnstile';
import { useCallback, useEffect, useRef, useState } from 'react';
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

  return challenge;
};
const generateChallengeResponse = async (challenge: string) => {
  if (!environment.isDesktop) {
    return undefined;
  }

  return await window.apis?.ui?.getChallengeResponse(challenge);
};

const Challenge = () => {
  return <div className={style.captchaWrapper}>Making Challenge</div>;
};

const Verified = () => {
  return <div className={style.captchaWrapper}>Verified Client</div>;
};

export const useCaptcha = (): [string | null, () => JSX.Element, string?] => {
  const [verifyToken, Captcha] = useCloudflareCaptcha();
  const { data: challenge } = useSWR('/api/auth/challenge', challengeFetcher, {
    revalidateOnFocus: false,
  });
  const [response, setResponse] = useState<string>();
  const prevChallenge = useRef('');

  useEffect(() => {
    if (
      environment.isDesktop &&
      challenge?.challenge &&
      prevChallenge.current !== challenge.challenge
    ) {
      prevChallenge.current = challenge.challenge;
      generateChallengeResponse(challenge.resource)
        .then(setResponse)
        .catch(err => {
          console.error('Error getting challenge response:', err);
        });
    }
  }, [challenge]);

  if (environment.isDesktop) {
    if (response) {
      return [response, Verified, challenge?.challenge];
    } else {
      return [null, Challenge, challenge?.challenge];
    }
  }

  return [verifyToken, Captcha];
};
