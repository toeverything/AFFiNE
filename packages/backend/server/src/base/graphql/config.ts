import { ApolloDriverConfig } from '@nestjs/apollo';

import { defineModuleConfig } from '../config';

declare global {
  interface AppConfigSchema {
    graphql: {
      apolloDriverConfig: ConfigItem<ApolloDriverConfig>;
    };
  }
}

defineModuleConfig('graphql', {
  apolloDriverConfig: {
    desc: 'The config for underlying nestjs GraphQL and apollo driver engine.',
    default: {
      // @TODO(@forehalo): need a flag to tell user `Restart Required` configs
      introspection: true,
    },
    link: 'https://docs.nestjs.com/graphql/quick-start',
  },
});
