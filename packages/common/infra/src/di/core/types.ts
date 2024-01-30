import type { ServiceProvider } from './provider';

// eslint-disable-next-line @typescript-eslint/ban-types
export type Type<T = any> = abstract new (...args: any) => T;

export type ServiceFactory<T = any> = (provider: ServiceProvider) => T;
export type ServiceVariant = string;

/**
 *
 */
export type ServiceScope = string[];

export type ServiceIdentifierValue = {
  identifierName: string;
  variant: ServiceVariant;
};

export type GeneralServiceIdentifier<T = any> = ServiceIdentifier<T> | Type<T>;

export type ServiceIdentifier<T> = {
  identifierName: string;
  variant: ServiceVariant;
  __TYPE__: T;
};

export type ServiceIdentifierType<T> = T extends ServiceIdentifier<infer R>
  ? R
  : T extends Type<infer R>
    ? R
    : never;

export type TypesToDeps<T extends any[]> = {
  [index in keyof T]:
    | GeneralServiceIdentifier<T[index]>
    | (T[index] extends (infer I)[] ? [GeneralServiceIdentifier<I>] : never);
};
