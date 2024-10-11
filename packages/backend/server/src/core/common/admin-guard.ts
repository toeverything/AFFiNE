import type {
  CanActivate,
  ExecutionContext,
  OnModuleInit,
} from '@nestjs/common';
import { Injectable, UseGuards } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';

import {
  ActionForbidden,
  getRequestResponseFromContext,
} from '../../fundamentals';
import { FeatureManagementService } from '../features/management';

@Injectable()
export class AdminGuard implements CanActivate, OnModuleInit {
  private feature!: FeatureManagementService;

  constructor(private readonly ref: ModuleRef) {}

  onModuleInit() {
    this.feature = this.ref.get(FeatureManagementService, { strict: false });
  }

  async canActivate(context: ExecutionContext) {
    const { req } = getRequestResponseFromContext(context);
    let allow = false;
    if (req.session) {
      allow = await this.feature.isAdmin(req.session.user.id);
    }

    if (!allow) {
      throw new ActionForbidden();
    }

    return true;
  }
}

/**
 * This guard is used to protect routes/queries/mutations that require a user to be administrator.
 *
 * @example
 *
 * ```typescript
 * \@Admin()
 * \@Mutation(() => UserType)
 * createAccount(userInput: UserInput) {
 *   // ...
 * }
 * ```
 */
export const Admin = () => {
  return UseGuards(AdminGuard);
};
