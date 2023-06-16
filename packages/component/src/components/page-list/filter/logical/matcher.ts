import type { TType } from './typesystem';
import { typesystem } from './typesystem';

type MatcherData<Data, Type extends TType = TType> = { type: Type; data: Data };

export class Matcher<Data, Type extends TType = TType> {
  private list: MatcherData<Data, Type>[] = [];

  constructor(private _match?: (type: Type, target: TType) => boolean) {}

  register(type: Type, data: Data) {
    this.list.push({ type, data });
  }

  match(type: TType) {
    const match = this._match ?? typesystem.isSubtype.bind(typesystem);
    for (const t of this.list) {
      if (match(t.type, type)) {
        return t.data;
      }
    }
    return;
  }

  allMatched(type: TType): MatcherData<Data>[] {
    const match = this._match ?? typesystem.isSubtype.bind(typesystem);
    const result: MatcherData<Data>[] = [];
    for (const t of this.list) {
      if (match(t.type, type)) {
        result.push(t);
      }
    }
    return result;
  }

  allMatchedData(type: TType): Data[] {
    return this.allMatched(type).map(v => v.data);
  }

  findData(f: (data: Data) => boolean): Data | undefined {
    return this.list.find(data => f(data.data))?.data;
  }

  find(
    f: (data: MatcherData<Data, Type>) => boolean
  ): MatcherData<Data, Type> | undefined {
    return this.list.find(f);
  }

  all(): MatcherData<Data, Type>[] {
    return this.list;
  }
}
