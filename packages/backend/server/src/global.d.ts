declare namespace Express {
  interface Request {
    session?: import('./core/auth/session').Session;
  }
}

declare type PrimitiveType =
  | string
  | number
  | boolean
  | symbol
  | null
  | undefined;

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

declare type AFFiNEModule =
  | import('@nestjs/common').Type
  | import('@nestjs/common').DynamicModule;
