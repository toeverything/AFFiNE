import { createPrivateKey, createPublicKey } from 'node:crypto';

import { defineStartupConfig, ModuleConfig } from '../config';

declare module '../config' {
  interface AppConfig {
    crypto: ModuleConfig<{
      secret: {
        publicKey: string;
        privateKey: string;
      };
    }>;
  }
}

// Don't use this in production
const examplePrivateKey = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIEtyAJLIULkphVhqXqxk4Nr8Ggty3XLwUJWBxzAWCWTMoAoGCCqGSM49
AwEHoUQDQgAEF3U/0wIeJ3jRKXeFKqQyBKlr9F7xaAUScRrAuSP33rajm3cdfihI
3JvMxVNsS2lE8PSGQrvDrJZaDo0L+Lq9Gg==
-----END EC PRIVATE KEY-----`;

defineStartupConfig('crypto', {
  secret: (function () {
    const AFFINE_PRIVATE_KEY =
      process.env.AFFINE_PRIVATE_KEY ?? examplePrivateKey;
    const privateKey = createPrivateKey({
      key: Buffer.from(AFFINE_PRIVATE_KEY),
      format: 'pem',
      type: 'sec1',
    })
      .export({
        format: 'pem',
        type: 'pkcs8',
      })
      .toString('utf8');
    const publicKey = createPublicKey({
      key: Buffer.from(AFFINE_PRIVATE_KEY),
      format: 'pem',
      type: 'spki',
    })
      .export({
        format: 'pem',
        type: 'spki',
      })
      .toString('utf8');

    return {
      publicKey,
      privateKey,
    };
  })(),
});
