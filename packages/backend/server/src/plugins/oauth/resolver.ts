import {
  Context,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import type { Request } from 'express';
import semver from 'semver';

import { getClientVersionFromRequest } from '../../base';
import { ServerConfigType } from '../../core/config/types';
import { OAuthProviderName } from './config';
import { OAuthProviderFactory } from './factory';

registerEnumType(OAuthProviderName, { name: 'OAuthProviderType' });

const APPLE_OAUTH_PROVIDER_MIN_VERSION = new semver.Range('>=0.22.0', {
  includePrerelease: true,
});

@Resolver(() => ServerConfigType)
export class OAuthResolver {
  constructor(private readonly factory: OAuthProviderFactory) {}

  @ResolveField(() => [OAuthProviderName])
  oauthProviders(@Context() ctx: { req: Request }) {
    // Apple oauth provider is not supported in client version < 0.22.0
    const providers = this.factory.providers;
    if (providers.includes(OAuthProviderName.Apple)) {
      const version = getClientVersionFromRequest(ctx.req);
      if (!version || !APPLE_OAUTH_PROVIDER_MIN_VERSION.test(version)) {
        return providers.filter(p => p !== OAuthProviderName.Apple);
      }
    }

    return providers;
  }
}
