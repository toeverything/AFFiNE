import type { ServiceProviderExt } from '../ext';

export type ServiceFactory = (provider: ServiceProvider) => any;
export type ServiceVariant = string | symbol;
export type ServiceType = any;

export interface BaseServiceCollection {
  services: Map<ServiceType, Map<ServiceVariant, ServiceFactory>>;
  add(type: ServiceType, service: any, variant?: ServiceVariant): void;
  addFactory(
    type: ServiceType,
    factory: ServiceFactory,
    variant?: ServiceVariant
  ): void;
  provider(): ServiceProvider;
}

export type BaseServiceCollectionConstructor = {
  new (): BaseServiceCollection;
};

export interface RawServiceProvider {
  resolveRaw(type: ServiceType, variant?: ServiceVariant): any;
  resolveAllRaw(type: ServiceType): Map<ServiceVariant, any>;
}

export interface BaseServiceProvider extends RawServiceProvider {
  resolve<T = any>(
    type: Type<T> | string | symbol,
    variant?: ServiceVariant
  ): T;
}

export type BaseServiceProviderConstructor = {
  new (provider: RawServiceProvider): BaseServiceProvider;
};

export interface ServiceProvider
  extends ServiceProviderExt,
    BaseServiceProvider {}

// eslint-disable-next-line @typescript-eslint/ban-types
export interface Type<T = any> extends Function {
  new (...args: any[]): T;
}
