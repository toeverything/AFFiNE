type KeyToKey<T extends OpSchema> = {
  [K in keyof T]: string extends K ? never : K;
};

declare type ValuesOf<T> = T extends {
  [K in keyof T]: infer _U;
}
  ? _U
  : never;

export interface OpSchema {
  [key: string]: [any, any?];
}

type RequiredInput<In> = In extends void ? [] : In extends never ? [] : [In];

export type OpNames<T extends OpSchema> = ValuesOf<KeyToKey<T>>;
export type OpInput<
  Ops extends OpSchema,
  Type extends OpNames<Ops>,
> = Type extends keyof Ops
  ? Ops[Type] extends [infer In]
    ? RequiredInput<In>
    : Ops[Type] extends [infer In, infer _Out]
      ? RequiredInput<In>
      : never
  : never;

export type OpInputWithSignal<Ops extends OpSchema, Type extends OpNames<Ops>> =
  OpInput<Ops, Type> extends [infer In]
    ? [In, AbortSignal | undefined] | [In]
    : [AbortSignal | undefined] | [];

export type OpOutput<
  Ops extends OpSchema,
  Type extends OpNames<Ops>,
> = Type extends keyof Ops
  ? Ops[Type] extends [infer _In, infer Out]
    ? Out
    : never
  : never;
