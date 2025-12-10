import { Logger, OnModuleInit } from '@nestjs/common';

import type {
  Resource,
  ResourceAction,
  ResourceRole,
  ResourceType,
} from './resource';

const ACTION_CHECKER_PROVIDERS = new Map<ResourceType, AccessController<any>>();

function registerAccessController<Type extends ResourceType>(
  type: Type,
  provider: AccessController<Type>
) {
  ACTION_CHECKER_PROVIDERS.set(type, provider);
}

export function getAccessController<Type extends ResourceType>(
  type: Type
): AccessController<Type> {
  const provider = ACTION_CHECKER_PROVIDERS.get(type);
  if (!provider) {
    throw new Error(`No action checker provider for type ${type}`);
  }
  return provider;
}

export abstract class AccessController<
  Type extends ResourceType,
> implements OnModuleInit {
  protected abstract readonly type: Type;
  protected logger = new Logger(AccessController.name);

  onModuleInit() {
    registerAccessController(this.type, this);
  }

  abstract assert(
    resource: Resource<Type>,
    action: ResourceAction<Type>
  ): Promise<void>;

  abstract can(
    resource: Resource<Type>,
    action: ResourceAction<Type>
  ): Promise<boolean>;

  abstract role(resource: Resource<Type>): Promise<{
    role: ResourceRole<Type> | null;
    permissions: Record<ResourceAction<Type>, boolean>;
  }>;
}
