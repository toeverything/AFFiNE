import {
  applyServiceCollectionAllExt,
  type ServiceCollectionExt,
} from '../ext';
import { DEFAULT_SERVICE_VARIANT } from './consts';
import { createServiceProvider } from './provider';
import { RawServiceProviderImpl } from './raw-provider';
import type {
  BaseServiceCollection,
  ServiceFactory,
  ServiceProvider,
  ServiceType,
  ServiceVariant,
} from './types';

export class AbstractServiceCollection implements BaseServiceCollection {
  services: Map<ServiceType, Map<ServiceVariant, ServiceFactory>> = new Map();

  add(type: ServiceType, service: any, variant?: ServiceVariant) {
    this.addFactory(type, () => service, variant);
  }
  addFactory(
    type: ServiceType,
    factory: ServiceFactory,
    variant = DEFAULT_SERVICE_VARIANT
  ) {
    const services = this.services.get(type) ?? new Map();
    services.set(variant, factory);
    this.services.set(type, services);
  }

  provider(): ServiceProvider {
    return createServiceProvider(new RawServiceProviderImpl(this));
  }
}

export const ServiceCollection = applyServiceCollectionAllExt(
  AbstractServiceCollection
) as { new (): BaseServiceCollection & ServiceCollectionExt };
