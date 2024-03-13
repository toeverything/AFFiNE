import { Module } from '@nestjs/common';
import { Field, ObjectType, Query, registerEnumType } from '@nestjs/graphql';

import { DeploymentType } from '../fundamentals';
import { Public } from './auth';

export enum ServerFeature {
  Payment = 'payment',
  OAuth = 'oauth',
}

registerEnumType(ServerFeature, {
  name: 'ServerFeature',
});

registerEnumType(DeploymentType, {
  name: 'ServerDeploymentType',
});

const ENABLED_FEATURES: Set<ServerFeature> = new Set();
export function ADD_ENABLED_FEATURES(feature: ServerFeature) {
  ENABLED_FEATURES.add(feature);
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

  @Field(() => DeploymentType, { description: 'server type' })
  type!: DeploymentType;

  /**
   * @deprecated
   */
  @Field({ description: 'server flavor', deprecationReason: 'use `features`' })
  flavor!: string;

  @Field(() => [ServerFeature], { description: 'enabled server features' })
  features!: ServerFeature[];
}

export class ServerConfigResolver {
  @Public()
  @Query(() => ServerConfigType, {
    description: 'server config',
  })
  serverConfig(): ServerConfigType {
    return {
      name: AFFiNE.serverName,
      version: AFFiNE.version,
      baseUrl: AFFiNE.baseUrl,
      type: AFFiNE.type,
      // BACKWARD COMPATIBILITY
      // the old flavors contains `selfhosted` but it actually not flavor but deployment type
      // this field should be removed after frontend feature flags implemented
      flavor: AFFiNE.type,
      features: Array.from(ENABLED_FEATURES),
    };
  }
}

@Module({
  providers: [ServerConfigResolver],
})
export class ServerConfigModule {}
