import {
  Args,
  Field,
  GraphQLISODateTime,
  Mutation,
  ObjectType,
  Query,
  registerEnumType,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { RuntimeConfig, RuntimeConfigType } from '@prisma/client';
import { GraphQLJSON, GraphQLJSONObject } from 'graphql-scalars';

import { Config, URLHelper } from '../../fundamentals';
import { Public } from '../auth';
import { Admin } from '../common';
import { FeatureType } from '../features';
import { AvailableUserFeatureConfig } from '../features/resolver';
import { ServerFlags } from './config';
import { ENABLED_FEATURES } from './server-feature';
import { ServerService } from './service';
import { ServerConfigType } from './types';

@ObjectType()
export class PasswordLimitsType {
  @Field()
  minLength!: number;
  @Field()
  maxLength!: number;
}

@ObjectType()
export class CredentialsRequirementType {
  @Field()
  password!: PasswordLimitsType;
}

registerEnumType(RuntimeConfigType, {
  name: 'RuntimeConfigType',
});
@ObjectType()
export class ServerRuntimeConfigType implements Partial<RuntimeConfig> {
  @Field()
  id!: string;

  @Field()
  module!: string;

  @Field()
  key!: string;

  @Field()
  description!: string;

  @Field(() => GraphQLJSON)
  value!: any;

  @Field(() => RuntimeConfigType)
  type!: RuntimeConfigType;

  @Field(() => GraphQLISODateTime)
  updatedAt!: Date;
}

@ObjectType()
export class ServerFlagsType implements ServerFlags {
  @Field()
  earlyAccessControl!: boolean;

  @Field()
  syncClientVersionCheck!: boolean;
}

@Resolver(() => ServerConfigType)
export class ServerConfigResolver {
  constructor(
    private readonly config: Config,
    private readonly url: URLHelper,
    private readonly server: ServerService
  ) {}

  @Public()
  @Query(() => ServerConfigType, {
    description: 'server config',
  })
  serverConfig(): ServerConfigType {
    return {
      name: this.config.serverName,
      version: this.config.version,
      baseUrl: this.url.home,
      type: this.config.type,
      // BACKWARD COMPATIBILITY
      // the old flavors contains `selfhosted` but it actually not flavor but deployment type
      // this field should be removed after frontend feature flags implemented
      flavor: this.config.type,
      features: Array.from(ENABLED_FEATURES),
      enableTelemetry: this.config.metrics.telemetry.enabled,
    };
  }

  @ResolveField(() => CredentialsRequirementType, {
    description: 'credentials requirement',
  })
  async credentialsRequirement() {
    const config = await this.config.runtime.fetchAll({
      'auth/password.max': true,
      'auth/password.min': true,
    });

    return {
      password: {
        minLength: config['auth/password.min'],
        maxLength: config['auth/password.max'],
      },
    };
  }

  @ResolveField(() => ServerFlagsType, {
    description: 'server flags',
  })
  async flags(): Promise<ServerFlagsType> {
    const records = await this.config.runtime.list('flags');

    return records.reduce((flags, record) => {
      flags[record.key as keyof ServerFlagsType] = record.value as any;
      return flags;
    }, {} as ServerFlagsType);
  }

  @ResolveField(() => Boolean, {
    description: 'whether server has been initialized',
  })
  async initialized() {
    return this.server.initialized();
  }
}

@Resolver(() => ServerConfigType)
export class ServerFeatureConfigResolver extends AvailableUserFeatureConfig {
  constructor(config: Config) {
    super(config);
  }

  @ResolveField(() => [FeatureType], {
    description: 'Features for user that can be configured',
  })
  override availableUserFeatures() {
    return super.availableUserFeatures();
  }
}

@ObjectType()
class ServerServiceConfig {
  @Field()
  name!: string;

  @Field(() => GraphQLJSONObject)
  config!: any;
}

interface ServerServeConfig {
  https: boolean;
  host: string;
  port: number;
  externalUrl: string;
}

interface ServerMailerConfig {
  host?: string | null;
  port?: number | null;
  secure?: boolean | null;
  service?: string | null;
  sender?: string | null;
}

interface ServerDatabaseConfig {
  host: string;
  port: number;
  user?: string | null;
  database: string;
}

@Admin()
@Resolver(() => ServerRuntimeConfigType)
export class ServerRuntimeConfigResolver {
  constructor(private readonly config: Config) {}

  @Query(() => [ServerRuntimeConfigType], {
    description: 'get all server runtime configurable settings',
  })
  serverRuntimeConfig(): Promise<ServerRuntimeConfigType[]> {
    return this.config.runtime.list();
  }

  @Mutation(() => ServerRuntimeConfigType, {
    description: 'update server runtime configurable setting',
  })
  async updateRuntimeConfig(
    @Args('id') id: string,
    @Args({ type: () => GraphQLJSON, name: 'value' }) value: any
  ): Promise<ServerRuntimeConfigType> {
    return await this.config.runtime.set(id as any, value);
  }

  @Mutation(() => [ServerRuntimeConfigType], {
    description: 'update multiple server runtime configurable settings',
  })
  async updateRuntimeConfigs(
    @Args({ type: () => GraphQLJSONObject, name: 'updates' }) updates: any
  ): Promise<ServerRuntimeConfigType[]> {
    const keys = Object.keys(updates);
    const results = await Promise.all(
      keys.map(key => this.config.runtime.set(key as any, updates[key]))
    );

    return results;
  }
}

@Admin()
@Resolver(() => ServerServiceConfig)
export class ServerServiceConfigResolver {
  constructor(private readonly config: Config) {}

  @Query(() => [ServerServiceConfig])
  serverServiceConfigs() {
    return [
      {
        name: 'server',
        config: this.serve(),
      },
      {
        name: 'mailer',
        config: this.mail(),
      },
      {
        name: 'database',
        config: this.database(),
      },
    ];
  }

  serve(): ServerServeConfig {
    return this.config.server;
  }

  mail(): ServerMailerConfig {
    const sender =
      typeof this.config.mailer.from === 'string'
        ? this.config.mailer.from
        : this.config.mailer.from?.address;

    return {
      host: this.config.mailer.host,
      port: this.config.mailer.port,
      secure: this.config.mailer.secure,
      service: this.config.mailer.service,
      sender,
    };
  }

  database(): ServerDatabaseConfig {
    const url = new URL(this.config.database.datasourceUrl);

    return {
      host: url.hostname,
      port: Number(url.port),
      user: url.username,
      database: url.pathname.slice(1) ?? url.username,
    };
  }
}
