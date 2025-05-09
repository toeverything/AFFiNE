import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { GUARD_PROVIDER, NamedGuards } from './provider';

const BasicGuardSymbol = Symbol('BasicGuard');

@Injectable()
export class BasicGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext) {
    // get registered guard name
    const providerName = this.reflector.get<string[]>(
      BasicGuardSymbol,
      context.getHandler()
    );

    if (Array.isArray(providerName) && providerName.length > 0) {
      for (const name of providerName) {
        const provider = GUARD_PROVIDER[name as NamedGuards];
        if (provider) {
          const ret = await provider.canActivate(context);
          if (!ret) return false;
        }
      }
    }

    return true;
  }
}

/**
 * This guard is used to protect routes/queries/mutations that use a registered guard
 *
 * @example
 *
 * ```typescript
 * \@UseNamedGuard('captcha') // use captcha guard
 * \@Auth()
 * \@Query(() => UserType)
 * user(@CurrentUser() user: CurrentUser) {
 *   return user;
 * }
 * ```
 */
export const UseNamedGuard = (...name: NamedGuards[]) =>
  applyDecorators(UseGuards(BasicGuard), SetMetadata(BasicGuardSymbol, name));
