import type { IndexerSchema } from './schema';

export class IndexerDocument<
  S extends keyof IndexerSchema = keyof IndexerSchema,
> {
  constructor(public readonly id: string) {}

  fields = new Map<keyof IndexerSchema[S], string[]>();

  public insert<F extends keyof IndexerSchema[S]>(
    field: F,
    value: string | string[]
  ) {
    const values = this.fields.get(field) ?? [];
    if (Array.isArray(value)) {
      values.push(...value);
    } else {
      values.push(value);
    }
    this.fields.set(field, values);
  }

  get<F extends keyof IndexerSchema[S]>(
    field: F
  ): string[] | string | undefined {
    const values = this.fields.get(field);
    if (values === undefined) {
      return undefined;
    } else if (values.length === 1) {
      return values[0];
    } else {
      return values;
    }
  }

  static from<S extends keyof IndexerSchema>(
    id: string,
    map:
      | Partial<Record<keyof IndexerSchema[S], string | string[]>>
      | Map<keyof IndexerSchema[S], string | string[]>
  ): IndexerDocument<S> {
    const doc = new IndexerDocument<S>(id);

    if (map instanceof Map) {
      for (const [key, value] of map) {
        doc.insert(key, value);
      }
    } else {
      for (const key in map) {
        if (map[key] === undefined || map[key] === null) {
          continue;
        }
        doc.insert(key, map[key]);
      }
    }
    return doc;
  }
}
