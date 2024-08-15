import './config';

import { AuthModule } from '../../core/auth';
import { ServerFeature } from '../../core/config';
import { UserModule } from '../../core/user';
import { Plugin } from '../registry';
import { OAuthController } from './controller';
import { OAuthProviders } from './providers';
import { OAuthProviderFactory } from './register';
import { OAuthResolver } from './resolver';
import { OAuthService } from './service';

@Plugin({
  name: 'oauth',
  imports: [AuthModule, UserModule],
  providers: [
    OAuthProviderFactory,
    OAuthService,
    OAuthResolver,
    ...OAuthProviders,
  ],
  controllers: [OAuthController],
  contributesTo: ServerFeature.OAuth,
  if: config => config.flavor.graphql && !!config.plugins.oauth,
})
export class OAuthModule {}
