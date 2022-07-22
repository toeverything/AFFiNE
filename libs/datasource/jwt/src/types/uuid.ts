/* eslint-disable @typescript-eslint/naming-convention */
type VersionChar = '1' | '2' | '3' | '4' | '5';

type Char =
    | '0'
    | '1'
    | '2'
    | '3'
    | '4'
    | '5'
    | '6'
    | '7'
    | '8'
    | '9'
    | 'a'
    | 'b'
    | 'c'
    | 'd'
    | 'e'
    | 'f';

type Prev<X extends number> = [
    never,
    0,
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
    11,
    ...never[]
][X];

type HasLength<S extends string, Len extends number> = [Len] extends [0]
    ? S extends ''
        ? true
        : never
    : S extends `${infer C}${infer Rest}`
    ? Lowercase<C> extends Char
        ? HasLength<Rest, Prev<Len>>
        : never
    : never;

type Char4<S extends string> = true extends HasLength<S, 4> ? S : never;
type Char8<S extends string> = true extends HasLength<S, 8> ? S : never;
type Char12<S extends string> = true extends HasLength<S, 12> ? S : never;

type VersionGroup<S extends string> = S extends `${infer Version}${infer Rest}`
    ? Version extends VersionChar
        ? true extends HasLength<Rest, 3>
            ? S
            : never
        : never
    : never;

type NilUUID = '00000000-0000-0000-0000-000000000000';
export type UUID<S extends string> = S extends NilUUID
    ? S
    : S extends `${infer S8}-${infer S4_1}-${infer S4_2}-${infer S4_3}-${infer S12}`
    ? S8 extends Char8<S8>
        ? S4_1 extends Char4<S4_1>
            ? S4_2 extends VersionGroup<S4_2>
                ? S4_3 extends Char4<S4_3>
                    ? S12 extends Char12<S12>
                        ? S
                        : never
                    : never
                : never
            : never
        : never
    : never;
