import type { Schema } from './schema';

export class Document<S extends Schema = any> {
  constructor(public readonly id: string) {}

  fields = new Map<keyof S, string[]>();

  public insert<F extends keyof S>(field: F, value: string | string[]) {
    const values = this.fields.get(field) ?? [];
    if (Array.isArray(value)) {
      values.push(...value);
    } else {
      values.push(value);
    }
    this.fields.set(field, values);
  }

  get<F extends keyof S>(field: F): string[] | string | undefined {
    const values = this.fields.get(field);
    if (values === undefined) {
      return undefined;
    } else if (values.length === 1) {
      return values[0];
    } else {
      return values;
    }
  }

  static from<S extends Schema>(
    id: string,
    map:
      | Partial<Record<keyof S, string | string[]>>
      | Map<keyof S, string | string[]>
  ): Document<S> {
    const doc = new Document(id);

    if (map instanceof Map) {
      for (const [key, value] of map) {
        doc.insert(key, value);
      }
    } else {
      for (const key in map) {
        if (map[key] === undefined) {
          continue;
        }
        doc.insert(key, map[key]);
      }
    }
    return doc;
  }
}
