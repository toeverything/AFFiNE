import { Module } from '@nestjs/common';
import { Field, ObjectType, Query } from '@nestjs/graphql';

export const { SERVER_FLAVOR } = process.env;

@ObjectType()
export class ServerConfigType {
  @Field({ description: 'server version' })
  version!: string;

  @Field({ description: 'server flavor' })
  flavor!: string;
}

export class ServerConfigResolver {
  @Query(() => ServerConfigType, {
    description: 'server config',
  })
  serverConfig(): ServerConfigType {
    return {
      version: AFFiNE.version,
      flavor: SERVER_FLAVOR || 'allinone',
    };
  }
}

@Module({
  providers: [ServerConfigResolver],
})
export class ServerConfigModule {}
