import type { Join, PathType } from '../utils/types';

export type Payload<T> = {
  __payload: true;
  data: T;
};

export type Leaves<T, P extends string = ''> =
  T extends Record<string, any>
    ? {
        [K in keyof T]: K extends string
          ? T[K] extends Payload<any>
            ? K
            : Join<K, Leaves<T[K], P>>
          : never;
      }[keyof T]
    : never;

export type Flatten<T extends Record<string, any>> = {
  // @ts-expect-error allow
  [K in Leaves<T>]: PathType<T, K> extends Payload<infer U> ? U : never;
};
