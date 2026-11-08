import { z } from 'zod';

export const OAuthProviderSchema = z.enum([
  'Google',
  'GitHub',
  'Apple',
  'OIDC',
]);

export const OAuthClientSchema = z.enum([
  'web',
  'affine',
  'affine-canary',
  'affine-beta',
  'affine-dev',
]);

export const OAuthPreflightBodySchema = z
  .object({
    provider: OAuthProviderSchema,
    redirect_uri: z
      .string()
      .min(1)
      .max(2048)
      .nullish()
      .transform(value => value ?? undefined),
    client: OAuthClientSchema,
    client_nonce: z.string().min(1).max(512),
  })
  .strict();

export const OAuthCallbackBodySchema = z
  .object({
    code: z.string().min(1).max(4096),
    state: z.string().min(1).max(16_384),
    client_nonce: z
      .string()
      .min(1)
      .max(512)
      .nullish()
      .transform(value => value ?? undefined),
    // Apple includes this JSON field on the first form_post callback.
    user: z.string().max(16_384).optional(),
  })
  .strict();

export const OAuthStateEnvelopeSchema = z
  .object({
    state: z.string().uuid(),
    provider: OAuthProviderSchema,
    client: OAuthClientSchema,
    flow: z.enum(['popup', 'redirect']).optional(),
    pkce: z
      .object({
        codeChallenge: z.string().min(1).max(512),
        codeChallengeMethod: z.literal('S256'),
      })
      .strict()
      .optional(),
  })
  .strict();
