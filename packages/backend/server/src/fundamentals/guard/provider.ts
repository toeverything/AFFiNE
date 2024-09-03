import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';

export interface RegisterGuardName {}

export type NamedGuards = keyof RegisterGuardName;

export const GUARD_PROVIDER: Partial<Record<NamedGuards, GuardProvider>> = {};

@Injectable()
export abstract class GuardProvider implements OnModuleInit, CanActivate {
  private readonly logger = new Logger(GuardProvider.name);
  abstract name: NamedGuards;

  onModuleInit() {
    GUARD_PROVIDER[this.name] = this;
    this.logger.log(`Guard provider [${this.name}] registered`);
  }

  abstract canActivate(context: ExecutionContext): boolean | Promise<boolean>;
}
