import type { Key, TableAdapter, TableOptions } from '../types';

declare module '../types' {
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
    return class TableAdapterImpl
      extends Class
      implements TableAdapterWithHook
    {
      hooks: Hook<unknown>[] = [];

      deserialize(data: unknown) {
        if (!this.hooks.length) {
          return data;
        }

        return this.hooks.reduce(
          (acc, hook) => hook.deserialize(acc),
          Object.assign({} as any, data)
        );
      }

      override setup(opts: TableOptions) {
        this.hooks = opts.hooks || [];
        super.setup(opts);
      }

      override create(key: Key, data: any) {
        return this.deserialize(super.create(key, data));
      }

      override get(key: Key) {
        return this.deserialize(super.get(key));
      }

      override update(key: Key, data: any) {
        return this.deserialize(super.update(key, data));
      }

      override subscribe(
        key: Key,
        callback: (data: unknown) => void
      ): () => void {
        return super.subscribe(key, data => callback(this.deserialize(data)));
      }
    };
  };
}
