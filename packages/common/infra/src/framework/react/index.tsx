import React, { useContext, useMemo } from 'react';

import type { FrameworkProvider, Scope, Service } from '../core';
import { ComponentNotFoundError, Framework } from '../core';
import { parseIdentifier } from '../core/identifier';
import type { GeneralIdentifier, IdentifierType, Type } from '../core/types';
import { MountPoint } from './scope-root-components';

export { useMount } from './scope-root-components';

export const FrameworkStackContext = React.createContext<FrameworkProvider[]>([
  Framework.EMPTY.provider(),
]);

export function useFramework(): FrameworkProvider {
  const stack = useContext(FrameworkStackContext);

  return stack[stack.length - 1]; // never null, because the default value
}

export function useService<T extends Service>(
  identifier: GeneralIdentifier<T>
): T {
  const stack = useContext(FrameworkStackContext);

  let service: T | null = null;

  for (let i = stack.length - 1; i >= 0; i--) {
    service = stack[i].getOptional(identifier, {
      sameScope: true,
    });

    if (service) {
      break;
    }
  }

  if (!service) {
    throw new ComponentNotFoundError(parseIdentifier(identifier));
  }

  return service;
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
  const stack = useContext(FrameworkStackContext);

  const services: any = {};

  for (const [key, value] of Object.entries(identifiers)) {
    let service;
    for (let i = stack.length - 1; i >= 0; i--) {
      service = stack[i].getOptional(value, {
        sameScope: true,
      });

      if (service) {
        break;
      }
    }

    if (!service) {
      throw new ComponentNotFoundError(parseIdentifier(value));
    }

    services[key.charAt(0).toLowerCase() + key.slice(1)] = service;
  }

  return services;
}

export function useServiceOptional<T extends Service>(
  identifier: Type<T>
): T | null {
  const stack = useContext(FrameworkStackContext);

  let service: T | null = null;

  for (let i = stack.length - 1; i >= 0; i--) {
    service = stack[i].getOptional(identifier, {
      sameScope: true,
    });

    if (service) {
      break;
    }
  }

  return service;
}

export const FrameworkRoot = ({
  framework,
  children,
}: React.PropsWithChildren<{ framework: FrameworkProvider }>) => {
  return (
    <FrameworkStackContext.Provider value={[framework]}>
      {children}
    </FrameworkStackContext.Provider>
  );
};

export const FrameworkScope = ({
  scope,
  children,
}: React.PropsWithChildren<{ scope?: Scope }>) => {
  const stack = useContext(FrameworkStackContext);

  const nextStack = useMemo(() => {
    if (!scope) return stack;
    return [...stack, scope.framework];
  }, [stack, scope]);

  return (
    <FrameworkStackContext.Provider value={nextStack}>
      <MountPoint>{children}</MountPoint>
    </FrameworkStackContext.Provider>
  );
};
