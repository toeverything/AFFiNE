import { registerEnumType, ResolveField, Resolver } from '@nestjs/graphql';

import { ServerConfigType } from '../../core/config/types';
import { OAuthProviderName } from './config';
import { OAuthService } from './service';

registerEnumType(OAuthProviderName, { name: 'OAuthProviderType' });

@Resolver(() => ServerConfigType)
export class OAuthResolver {
  constructor(private readonly oauth: OAuthService) {}

  @ResolveField(() => [OAuthProviderName])
  oauthProviders() {
    return this.oauth.providers;
  }
}
