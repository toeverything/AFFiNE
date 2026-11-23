import React, { useContext, useMemo } from 'react';

import type { FrameworkProvider, Scope, Service } from '../core';
import { Framework, FrameworkStackProvider } from '../core';
import type { GeneralIdentifier, IdentifierType, Type } from '../core/types';

export const FrameworkProviderContext = React.createContext<FrameworkProvider>(
  Framework.EMPTY.provider()
);

export function useFramework(): FrameworkProvider {
  return useContext(FrameworkProviderContext); // never null, because the default value
}

export function useService<T>(identifier: GeneralIdentifier<T>): T {
  return useContext(FrameworkProviderContext).get(identifier);
}

/**
 * Hook to get services from the current framework stack.
 *
 * Automatically converts the service name to camelCase.
 *
 * @example
 * ```ts
 * const { authService, userService } = useServices({ AuthService, UserService });
 * ```
 */
export function useServices<
  const T extends { [key in string]: GeneralIdentifier<Service> },
>(
  identifiers: T
): keyof T extends string
  ? { [key in Uncapitalize<keyof T>]: IdentifierType<T[Capitalize<key>]> }
  : never {
  const provider = useContext(FrameworkProviderContext);

  const services: any = {};

  for (const [key, value] of Object.entries(identifiers)) {
    services[key.charAt(0).toLowerCase() + key.slice(1)] = provider.get(value);
  }

  return services;
}

export function useServiceOptional<T extends Service>(
  identifier: Type<T>
): T | undefined {
  return useContext(FrameworkProviderContext).getOptional(identifier);
}

export const FrameworkRoot = ({
  framework,
  children,
}: React.PropsWithChildren<{ framework: FrameworkProvider }>) => {
  return (
    <FrameworkProviderContext.Provider value={framework}>
      {children}
    </FrameworkProviderContext.Provider>
  );
};

export const FrameworkScope = ({
  scope,
  children,
}: React.PropsWithChildren<{ scope?: Scope }>) => {
  const provider = useContext(FrameworkProviderContext);

  const nextStack = useMemo(() => {
    if (!scope) return provider;
    // make sure the stack order is inside to outside
    return new FrameworkStackProvider([scope.framework, provider]);
  }, [scope, provider]);

  return (
    <FrameworkProviderContext.Provider value={nextStack}>
      {children}
    </FrameworkProviderContext.Provider>
  );
};
