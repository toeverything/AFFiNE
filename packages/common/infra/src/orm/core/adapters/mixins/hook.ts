import type { TableAdapter, TableAdapterOptions } from '../types';
declare module '../../types' {
  interface TableOptions {
    hooks?: Hook<unknown>[];
  }
}

export interface Hook<T> {
  deserialize(dbVal: T): T;
}

export interface TableAdapterWithHook<T = unknown> extends Hook<T> {}

export function HookAdapter(): ClassDecorator {
  // @ts-expect-error allow
  return (Class: { new (...args: any[]): TableAdapter }) => {
    return class TableAdapterExtensions
      extends Class
      implements TableAdapterWithHook
    {
      hooks: Hook<unknown>[] = [];

      override setup(opts: TableAdapterOptions): void {
        super.setup(opts);
        this.hooks = opts.hooks ?? [];
      }

      deserialize(data: unknown) {
        if (!this.hooks.length) {
          return data;
        }

        return this.hooks.reduce(
          (acc, hook) => hook.deserialize(acc),
          Object.assign({} as any, data)
        );
      }

      override toObject(data: any): Record<string, any> {
        return this.deserialize(super.toObject(data));
      }
    };
  };
}
