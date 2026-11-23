import { Framework, LiveData } from '@toeverything/infra';
import { describe, expect, test, vi } from 'vitest';

import { ValidatorProvider } from '../provider/validator';
import { CaptchaService } from './captcha';
import { FetchService } from './fetch';
import { ServerService } from './server';

function createService(
  response: Record<string, unknown>,
  validate?: (challenge: string, resource: string) => Promise<string>
) {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
  );
  const framework = new Framework();
  framework.service(ServerService, {
    server: { features$: new LiveData({ captcha: true }) },
  } as any);
  framework.service(FetchService, { fetch } as any);
  if (validate) framework.impl(ValidatorProvider, { validate });
  framework.service(CaptchaService, f => {
    return new CaptchaService(
      f.get(ServerService),
      f.get(FetchService),
      f.getOptional(ValidatorProvider)
    );
  });
  const service = framework.provider().get(CaptchaService);
  return { fetch, service };
}

describe('CaptchaService', () => {
  test('mints a Hashcash proof from the server challenge', async () => {
    const validate = vi.fn(async () => 'hashcash-proof');
    const { fetch, service } = createService(
      {
        provider: 'hashcash',
        challenge: 'challenge-id',
        resource: 'resource-id',
      },
      validate
    );

    service.revalidate();
    await vi.waitFor(() => expect(service.isLoading$.value).toBe(false));

    expect(fetch).toHaveBeenCalledWith('/api/auth/captcha', {
      signal: expect.any(AbortSignal),
    });
    expect(validate).toHaveBeenCalledWith('challenge-id', 'resource-id');
    expect(service.provider$.value).toBe('hashcash');
    expect(service.challenge$.value).toBe('challenge-id');
    expect(service.verifyToken$.value).toBe('hashcash-proof');
  });

  test('uses server-provided Turnstile configuration without Hashcash', async () => {
    const { service } = createService({
      provider: 'turnstile',
      siteKey: 'site-key',
      action: 'auth-sign-in',
    });

    service.revalidate();
    await vi.waitFor(() => expect(service.isLoading$.value).toBe(false));

    expect(service.provider$.value).toBe('turnstile');
    expect(service.turnstile$.value).toEqual({
      siteKey: 'site-key',
      action: 'auth-sign-in',
    });
    expect(service.verifyToken$.value).toBeUndefined();
  });
});
