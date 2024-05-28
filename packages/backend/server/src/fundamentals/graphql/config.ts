import { ApolloDriverConfig } from '@nestjs/apollo';

import { defineStartupConfig, ModuleConfig } from '../../fundamentals/config';

declare module '../../fundamentals/config' {
  interface AppConfig {
    graphql: ModuleConfig<ApolloDriverConfig>;
  }
}

defineStartupConfig('graphql', {
  buildSchemaOptions: {
    numberScalarMode: 'integer',
  },
  introspection: true,
  playground: true,
});
