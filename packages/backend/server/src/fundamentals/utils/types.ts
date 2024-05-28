import { Readable } from 'node:stream';

export function ApplyType<T>(): ConstructorOf<T> {
  // @ts-expect-error used to fake the type of config
  return class Inner implements T {
    constructor() {}
  };
}

export type PathType<T, Path extends string> =
  T extends Record<string, any>
    ? string extends Path
      ? unknown
      : Path extends keyof T
        ? T[Path]
        : Path extends `${infer K}.${infer R}`
          ? K extends keyof T
            ? PathType<T[K], R>
            : unknown
          : unknown
    : unknown;

export type Join<Prefix, Suffixes> = Prefix extends string | number
  ? Suffixes extends string | number
    ? Prefix extends ''
      ? Suffixes
      : `${Prefix}.${Suffixes}`
    : never
  : never;

export type LeafPaths<
  T,
  Path extends string = '',
  MaxDepth extends string = '.....',
  Depth extends string = '',
> = Depth extends MaxDepth
  ? never
  : T extends Record<string | number, any>
    ? {
        [K in keyof T]-?: K extends string | number
          ? T[K] extends PrimitiveType
            ? K
            : Join<K, LeafPaths<T[K], Path, MaxDepth, `${Depth}.`>>
          : never;
      }[keyof T]
    : never;

export interface FileUpload {
  filename: string;
  mimetype: string;
  encoding: string;
  createReadStream: () => Readable;
}
