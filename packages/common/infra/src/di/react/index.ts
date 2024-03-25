import React, { useContext } from 'react';

import type { GeneralServiceIdentifier, ServiceProvider } from '../core';
import { ServiceCollection } from '../core';

export const ServiceProviderContext = React.createContext(
  ServiceCollection.EMPTY.provider()
);

export function useService<T>(
  identifier: GeneralServiceIdentifier<T>,
  { provider }: { provider?: ServiceProvider } = {}
): T {
  const contextServiceProvider = useContext(ServiceProviderContext);

  const serviceProvider = provider ?? contextServiceProvider;

  return serviceProvider.get(identifier);
}

export function useServiceOptional<T>(
  identifier: GeneralServiceIdentifier<T>,
  { provider }: { provider?: ServiceProvider } = {}
): T | null {
  const contextServiceProvider = useContext(ServiceProviderContext);

  const serviceProvider = provider ?? contextServiceProvider;

  return serviceProvider.getOptional(identifier);
}
