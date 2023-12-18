import type {
  RawServiceProvider,
  ServiceProvider,
  ServiceType,
  ServiceVariant,
  Type,
} from './types';

export class BaseServiceProvider implements ServiceProvider {
  constructor(public readonly provider: RawServiceProvider) {}

  resolveRaw(type: ServiceType, variant?: ServiceVariant | undefined) {
    return this.provider.resolveRaw(type, variant);
  }

  resolveAllRaw(type: ServiceType) {
    return this.provider.resolveAllRaw(type);
  }

  resolve<T>(type: Type<T>, variant?: ServiceVariant): T {
    return this.provider.resolveRaw(type, variant);
  }

  resolveAll<T = any>(type: string | symbol | Type<T>): Map<ServiceVariant, T> {
    return this.provider.resolveAllRaw(type);
  }
}

export function createServiceProvider(
  raw: RawServiceProvider
): BaseServiceProvider {
  return new BaseServiceProvider(raw);
}
