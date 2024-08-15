import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { Args, Query, Resolver } from '@nestjs/graphql';

import { Config } from '../config/provider';
import { generateUserFriendlyErrors } from './def';
import { ActionForbidden, ErrorDataUnionType, ErrorNames } from './errors.gen';

@Resolver(() => ErrorDataUnionType)
class ErrorResolver {
  // only exists for type registering
  @Query(() => ErrorDataUnionType)
  error(@Args({ name: 'name', type: () => ErrorNames }) _name: ErrorNames) {
    throw new ActionForbidden();
  }
}

@Module({
  providers: [ErrorResolver],
})
export class ErrorModule implements OnModuleInit {
  logger = new Logger('ErrorModule');
  constructor(private readonly config: Config) {}
  onModuleInit() {
    if (!this.config.node.dev) {
      return;
    }
    this.logger.log('Generating UserFriendlyError classes');
    const def = generateUserFriendlyErrors();

    writeFileSync(
      join(fileURLToPath(import.meta.url), '../errors.gen.ts'),
      def
    );
  }
}

export { UserFriendlyError } from './def';
export * from './errors.gen';
