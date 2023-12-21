import { Module } from '@nestjs/common';
import { Field, ObjectType, Query } from '@nestjs/graphql';

import { SERVER_FLAVOR } from '../config';

@ObjectType()
export class ServerConfigType {
  @Field({ description: 'server version' })
  version!: string;

  @Field({ description: 'server flavor' })
  flavor!: string;

  @Field({ description: 'server base url' })
  baseUrl!: string;
}

export class ServerConfigResolver {
  @Query(() => ServerConfigType, {
    description: 'server config',
  })
  serverConfig(): ServerConfigType {
    return {
      version: AFFiNE.version,
      flavor: SERVER_FLAVOR,
      baseUrl: AFFiNE.baseUrl,
    };
  }
}

@Module({
  providers: [ServerConfigResolver],
})
export class ServerConfigModule {}
