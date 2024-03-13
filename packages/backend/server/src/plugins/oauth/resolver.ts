import { registerEnumType, ResolveField, Resolver } from '@nestjs/graphql';

import { ServerConfigType } from '../../core/config';
import { OAuthProviderFactory } from './register';
import { OAuthProviderName } from './types';

registerEnumType(OAuthProviderName, { name: 'OAuthProviderType' });

@Resolver(() => ServerConfigType)
export class OAuthResolver {
  constructor(private readonly factory: OAuthProviderFactory) {}

  @ResolveField(() => [OAuthProviderName])
  oauthProviders() {
    return this.factory.providers;
  }
}
