import type {
  BaseServiceCollection,
  BaseServiceCollectionConstructor,
  BaseServiceProvider,
  BaseServiceProviderConstructor,
} from '../core/types';

export type ServiceProviderExt<ExtType extends object> = {
  __ext: ExtType;
  applyExt: (
    origin: BaseServiceProviderConstructor
  ) => BaseServiceProviderConstructor;
};

export type ServiceCollectionExt<ExtType extends object> = {
  __ext: ExtType;
  applyExt: (
    origin: BaseServiceCollectionConstructor
  ) => BaseServiceCollectionConstructor;
};

export function serviceProviderExt<
  ExtClassType extends BaseServiceProviderConstructor,
  ExtType = Omit<InstanceType<ExtClassType>, keyof BaseServiceProvider>,
>(applyExt: (origin: BaseServiceProviderConstructor) => ExtClassType) {
  return {
    __ext: null as ExtType,
    applyExt,
  };
}

// eslint-disable-next-line sonarjs/no-identical-functions
export function serviceCollectionExt<
  ExtClassType extends BaseServiceCollectionConstructor,
  ExtType = Omit<InstanceType<ExtClassType>, keyof BaseServiceCollection>,
>(applyExt: (origin: BaseServiceCollectionConstructor) => ExtClassType) {
  return {
    __ext: null as ExtType,
    applyExt,
  };
}
