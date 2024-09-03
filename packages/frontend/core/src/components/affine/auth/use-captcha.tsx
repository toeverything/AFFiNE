import { apis } from '@affine/electron-api';
import { Turnstile } from '@marsidev/react-turnstile';
import { useLiveData, useService } from '@toeverything/infra';
import { atom, useAtom, useSetAtom } from 'jotai';
import { useEffect, useRef } from 'react';
import useSWR from 'swr';

import { ServerConfigService } from '../../../modules/cloud';
import * as style from './style.css';

type Challenge = {
  challenge: string;
  resource: string;
};

const challengeFetcher = async (url: string) => {
  if (!environment.isDesktop) {
    return undefined;
  }

  const res = await fetch(url);
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

  return await apis?.ui?.getChallengeResponse(challenge);
};

const captchaAtom = atom<string | undefined>(undefined);
const responseAtom = atom<string | undefined>(undefined);

const useHasCaptcha = () => {
  const serverConfig = useService(ServerConfigService).serverConfig;
  const hasCaptcha = useLiveData(serverConfig.features$.map(r => r?.captcha));
  return hasCaptcha || false;
};

export const Captcha = () => {
  const setCaptcha = useSetAtom(captchaAtom);
  const [response] = useAtom(responseAtom);
  const hasCaptchaFeature = useHasCaptcha();

  if (!hasCaptchaFeature) {
    return null;
  }

  if (environment.isDesktop) {
    if (response) {
      return <div className={style.captchaWrapper}>Making Challenge</div>;
    } else {
      return <div className={style.captchaWrapper}>Verified Client</div>;
    }
  }

  return (
    <Turnstile
      className={style.captchaWrapper}
      siteKey={process.env.CAPTCHA_SITE_KEY || '1x00000000000000000000AA'}
      onSuccess={setCaptcha}
    />
  );
};

export const useCaptcha = (): [string | undefined, string?] => {
  const [verifyToken] = useAtom(captchaAtom);
  const [response, setResponse] = useAtom(responseAtom);
  const hasCaptchaFeature = useHasCaptcha();

  const { data: challenge } = useSWR('/api/auth/challenge', challengeFetcher, {
    suspense: false,
    revalidateOnFocus: false,
  });
  const prevChallenge = useRef('');

  useEffect(() => {
    if (
      hasCaptchaFeature &&
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
  }, [challenge, hasCaptchaFeature, setResponse]);

  if (!hasCaptchaFeature) {
    return ['XXXX.DUMMY.TOKEN.XXXX'];
  }

  if (environment.isDesktop) {
    if (response) {
      return [response, challenge?.challenge];
    } else {
      return [undefined, challenge?.challenge];
    }
  }

  return [verifyToken];
};
