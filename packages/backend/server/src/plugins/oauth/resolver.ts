import { registerEnumType, ResolveField, Resolver } from '@nestjs/graphql';

import { ServerConfigType } from '../../core/config/types';
import { OAuthProviderName } from './config';
import { OAuthProviderFactory } from './factory';

registerEnumType(OAuthProviderName, { name: 'OAuthProviderType' });

@Resolver(() => ServerConfigType)
export class OAuthResolver {
  constructor(private readonly factory: OAuthProviderFactory) {}

  @ResolveField(() => [OAuthProviderName])
  oauthProviders() {
    return this.factory.providers;
  }
}
