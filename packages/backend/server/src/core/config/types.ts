import { Field, ObjectType, registerEnumType } from '@nestjs/graphql';

import { DeploymentType } from '../../fundamentals';

export enum ServerFeature {
  Captcha = 'captcha',
  Copilot = 'copilot',
  Payment = 'payment',
  OAuth = 'oauth',
}

registerEnumType(ServerFeature, {
  name: 'ServerFeature',
});

registerEnumType(DeploymentType, {
  name: 'ServerDeploymentType',
});

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

  @Field({ description: 'enable telemetry' })
  enableTelemetry!: boolean;
}
