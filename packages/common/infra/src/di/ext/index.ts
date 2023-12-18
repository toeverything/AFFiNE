import type {
  BaseServiceCollectionConstructor,
  BaseServiceProviderConstructor,
} from '../core/types';
import * as test from './test';

const exts = [test];

export type ServiceProviderExt =
  (typeof exts)[number]['serviceProvider']['__ext'];

export type ServiceCollectionExt =
  (typeof exts)[number]['serviceCollection']['__ext'];

export function applyServiceProviderAllExt(
  origin: BaseServiceProviderConstructor
) {
  for (const ext of exts) {
    origin = ext.serviceProvider.applyExt(origin);
  }
  return origin;
}

export function applyServiceCollectionAllExt(
  origin: BaseServiceCollectionConstructor
) {
  for (const ext of exts) {
    origin = ext.serviceCollection.applyExt(origin);
  }
  return origin;
}
