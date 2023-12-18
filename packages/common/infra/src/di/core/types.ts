export type ServiceFactory = (provider: ServiceProvider) => any;
export type ServiceVariant = string | symbol;
export type ServiceType = any;

export interface RawServiceProvider {
  resolveRaw(type: ServiceType, variant?: ServiceVariant): any;
  resolveAllRaw(type: ServiceType): Map<ServiceVariant, any>;
}

export interface ServiceProvider extends RawServiceProvider {
  resolve<T = any>(
    type: Type<T> | string | symbol,
    variant?: ServiceVariant
  ): T;
  resolveAll<T = any>(type: Type<T> | string | symbol): Map<ServiceVariant, T>;
}

// eslint-disable-next-line @typescript-eslint/ban-types
export interface Type<T = any> extends Function {
  new (...args: any[]): T;
}
