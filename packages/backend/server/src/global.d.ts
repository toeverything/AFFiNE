declare namespace Express {
  interface Request {
    session?: import('./core/auth/session').Session;
    token?: import('./core/auth/session').TokenSession;
  }
}

declare type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K];
};

declare type Leaf<T> = T & { __leaf: true };
declare type NonLeaf<T> = T extends Leaf<infer V> ? V : T;

declare type DeeplyEraseLeaf<T> = T extends Leaf<infer V> ? V
 : 
   {
      [K in keyof T]: DeeplyEraseLeaf<T[K]>
    }

declare type PrimitiveType =
  | string
  | number
  | boolean
  | symbol
  | null
  | undefined

declare type UnionToIntersection<T> = (
  T extends any ? (x: T) => any : never
) extends (x: infer R) => any
  ? R
  : never;

declare type ConstructorOf<T> = {
  new (): T;
};

declare type DeepPartial<T> =
  T extends Array<infer U>
    ? DeepPartial<U>[]
    : T extends ReadonlyArray<infer U>
      ? ReadonlyArray<DeepPartial<U>>
      : T extends Record<string, any>
        ? {
            [K in keyof T]?: DeepPartial<T[K]>;
          }
        : T;

declare type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

declare type AFFiNEModule =
  | import('@nestjs/common').Type
  | import('@nestjs/common').DynamicModule;
