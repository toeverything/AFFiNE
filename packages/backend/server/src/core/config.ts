import { Module } from '@nestjs/common';
import { Field, ObjectType, Query, registerEnumType } from '@nestjs/graphql';

export enum ServerFeature {
  Payment = 'payment',
}

registerEnumType(ServerFeature, {
  name: 'ServerFeature',
});

const ENABLED_FEATURES: ServerFeature[] = [];
export function ADD_ENABLED_FEATURES(feature: ServerFeature) {
  ENABLED_FEATURES.push(feature);
}

@ObjectType()
export class ServerConfigType {
  @Field({
    description:
      'server identical name could be shown as badge on user interface',
  })
  name!: string;

  @Field({ description: 'server version' })
  version!: string;

  @Field({ description: 'server base url' })
  baseUrl!: string;

  /**
   * @deprecated
   */
  @Field({ description: 'server flavor', deprecationReason: 'use `features`' })
  flavor!: string;

  @Field(() => [ServerFeature], { description: 'enabled server features' })
  features!: ServerFeature[];
}
export class ServerConfigResolver {
  @Query(() => ServerConfigType, {
    description: 'server config',
  })
  serverConfig(): ServerConfigType {
    return {
      name: AFFiNE.serverName,
      version: AFFiNE.version,
      baseUrl: AFFiNE.baseUrl,
      flavor: AFFiNE.flavor.type,
      features: ENABLED_FEATURES,
    };
  }
}

@Module({
  providers: [ServerConfigResolver],
})
export class ServerConfigModule {}
