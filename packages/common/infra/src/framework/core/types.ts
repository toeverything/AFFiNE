import type { Scope } from './components/scope';
import type { FrameworkProvider } from './provider';

// eslint-disable-next-line @typescript-eslint/ban-types
export type Type<T = any> = abstract new (...args: any) => T;

export type ComponentFactory<T = any> = (provider: FrameworkProvider) => T;
export type ComponentVariant = string;

export type FrameworkScopeStack = Array<string | Type<Scope>>;
export type GeneralIdentifier<T = any> = Identifier<T> | Type<T>;

export type IdentifierName = string | Type<any>;
export type IdentifierValue = {
  identifierName: IdentifierName;
  variant: ComponentVariant;
};

export type Identifier<T> = IdentifierValue & {
  (variant: ComponentVariant): Identifier<T>;
  __TYPE__: T;
};

export type IdentifierType<T> =
  T extends GeneralIdentifier<infer R>
    ? R
    : T extends Type<infer R>
      ? R
      : never;

export type TypesToDeps<T> = {
  [index in keyof T]:
    | GeneralIdentifier<T[index]>
    | (T[index] extends (infer I)[] ? [GeneralIdentifier<I>] : never);
};

export type SubComponent = {
  identifier: Identifier<any>;
  factory: ComponentFactory;
};
