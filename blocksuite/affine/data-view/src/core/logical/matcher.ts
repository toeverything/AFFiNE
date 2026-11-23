import type { TypeInstance } from './type.js';
import { typeSystem } from './type-system.js';

type MatcherData<Data, Type extends TypeInstance = TypeInstance> = {
  type: Type;
  data: Data;
};

export class MatcherCreator<Data, Type extends TypeInstance = TypeInstance> {
  createMatcher(type: Type, data: Data) {
    return { type, data };
  }
}

export class Matcher<Data, Type extends TypeInstance = TypeInstance> {
  constructor(
    private readonly list: MatcherData<Data, Type>[],
    private readonly _match: (type: Type, target: TypeInstance) => boolean = (
      type,
      target
    ) => typeSystem.unify(target, type)
  ) {}

  all(): MatcherData<Data, Type>[] {
    return this.list;
  }

  allMatched(type: TypeInstance): MatcherData<Data>[] {
    const result: MatcherData<Data>[] = [];
    for (const t of this.list) {
      if (this._match(t.type, type)) {
        result.push(t);
      }
    }
    return result;
  }

  allMatchedData(type: TypeInstance): Data[] {
    const result: Data[] = [];
    for (const t of this.list) {
      if (this._match(t.type, type)) {
        result.push(t.data);
      }
    }
    return result;
  }

  find(
    f: (data: MatcherData<Data, Type>) => boolean
  ): MatcherData<Data, Type> | undefined {
    return this.list.find(f);
  }

  findData(f: (data: Data) => boolean): Data | undefined {
    return this.list.find(data => f(data.data))?.data;
  }

  isMatched(type: Type, target: TypeInstance) {
    return this._match(type, target);
  }

  match(type: TypeInstance) {
    for (const t of this.list) {
      if (this._match(t.type, type)) {
        return t.data;
      }
    }
    return;
  }
}

export class Matcher_<Value, Type extends TypeInstance> {
  constructor(
    private readonly list: Value[],
    private readonly getType: (value: Value) => Type,
    private readonly matchFunc: (
      type: Type,
      target: TypeInstance
    ) => boolean = (type, target) => typeSystem.unify(target, type)
  ) {}
  all(): Value[] {
    return this.list;
  }

  allMatched(type: TypeInstance): Value[] {
    const result: Value[] = [];
    for (const t of this.list) {
      const tType = this.getType(t);
      if (this.matchFunc(tType, type)) {
        result.push(t);
      }
    }
    return result;
  }

  find(f: (data: Value) => boolean): Value | undefined {
    return this.list.find(f);
  }

  isMatched(type: Type, target: TypeInstance) {
    return this.matchFunc(type, target);
  }

  match(type: TypeInstance) {
    for (const t of this.list) {
      const tType = this.getType(t);
      if (this.matchFunc(tType, type)) {
        return t;
      }
    }
    return;
  }
}
