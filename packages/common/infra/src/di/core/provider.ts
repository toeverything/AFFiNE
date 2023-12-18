import { applyServiceProviderAllExt } from '../ext';
import type {
  BaseServiceProvider,
  RawServiceProvider,
  ServiceProvider,
  ServiceType,
  ServiceVariant,
  Type,
} from './types';

class AbstractServiceProvider implements BaseServiceProvider {
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
}

const ServiceProviderWithExt = applyServiceProviderAllExt(
  AbstractServiceProvider
);

export function createServiceProvider(
  raw: RawServiceProvider
): ServiceProvider {
  return new ServiceProviderWithExt(raw) as ServiceProvider;
}
