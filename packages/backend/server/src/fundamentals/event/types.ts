export type Payload<T> = {
  __payload: true;
  data: T;
};

export type Join<A extends string, B extends string> = A extends ''
  ? B
  : `${A}.${B}`;

export type PathType<T, Path extends string> = string extends Path
  ? unknown
  : Path extends keyof T
    ? T[Path]
    : Path extends `${infer K}.${infer R}`
      ? K extends keyof T
        ? PathType<T[K], R>
        : unknown
      : unknown;

export type Leaves<T, P extends string = ''> =
  T extends Payload<any>
    ? P
    : T extends Record<string, any>
      ? {
          [K in keyof T]: K extends string ? Leaves<T[K], Join<P, K>> : never;
        }[keyof T]
      : never;

export type Flatten<T> =
  Leaves<T> extends infer R
    ? {
        // @ts-expect-error yo, ts can't make it
        [K in R]: PathType<T, K> extends Payload<infer U> ? U : never;
      }
    : never;
