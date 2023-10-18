/**
 * This file will be moved to a separate package soon.
 */

export interface TUnion {
  type: 'union';
  title: 'union';
  list: TType[];
}

export const tUnion = (list: TType[]): TUnion => ({
  type: 'union',
  title: 'union',
  list,
});

// TODO treat as data type
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface TArray<Ele extends TType = TType> {
  type: 'array';
  ele: Ele;
  title: 'array';
}

export const tArray = <const T extends TType>(ele: T): TArray<T> => {
  return {
    type: 'array',
    title: 'array',
    ele,
  };
};
export type TTypeVar = {
  type: 'typeVar';
  title: 'typeVar';
  name: string;
  bound: TType;
};
export const tTypeVar = (name: string, bound: TType): TTypeVar => {
  return {
    type: 'typeVar',
    title: 'typeVar',
    name,
    bound,
  };
};
export type TTypeRef = {
  type: 'typeRef';
  title: 'typeRef';
  name: string;
};
export const tTypeRef = (name: string): TTypeRef => {
  return {
    type: 'typeRef',
    title: 'typeRef',
    name,
  };
};

export type TFunction = {
  type: 'function';
  title: 'function';
  typeVars: TTypeVar[];
  args: TType[];
  rt: TType;
};

export const tFunction = (fn: {
  typeVars?: TTypeVar[];
  args: TType[];
  rt: TType;
}): TFunction => {
  return {
    type: 'function',
    title: 'function',
    typeVars: fn.typeVars ?? [],
    args: fn.args,
    rt: fn.rt,
  };
};

export type TType = TDataType | TArray | TUnion | TTypeRef | TFunction;

export type DataTypeShape = Record<string, unknown>;
export type TDataType<Data extends DataTypeShape = Record<string, unknown>> = {
  type: 'data';
  name: string;
  data?: Data;
};
export type ValueOfData<T extends DataDefine> = T extends DataDefine<infer R>
  ? R
  : never;

export class DataDefine<Data extends DataTypeShape = Record<string, unknown>> {
  constructor(
    private config: DataDefineConfig<Data>,
    private dataMap: Map<string, DataDefine>
  ) {}

  create(data?: Data): TDataType<Data> {
    return {
      type: 'data',
      name: this.config.name,
      data,
    };
  }

  is(data: TType): data is TDataType<Data> {
    if (data.type !== 'data') {
      return false;
    }
    return data.name === this.config.name;
  }

  private isByName(name: string): boolean {
    return name === this.config.name;
  }

  isSubOf(superType: TDataType): boolean {
    if (this.is(superType)) {
      return true;
    }
    return this.config.supers.some(sup => sup.isSubOf(superType));
  }

  private isSubOfByName(superType: string): boolean {
    if (this.isByName(superType)) {
      return true;
    }
    return this.config.supers.some(sup => sup.isSubOfByName(superType));
  }

  isSuperOf(subType: TDataType): boolean {
    const dataDefine = this.dataMap.get(subType.name);
    if (!dataDefine) {
      throw new Error('bug');
    }
    return dataDefine.isSubOfByName(this.config.name);
  }
}

// type DataTypeVar = {};

// TODO support generic data type
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface DataDefineConfig<T extends DataTypeShape> {
  name: string;
  supers: DataDefine[];
  _phantom?: T;
}

interface DataHelper<T extends DataTypeShape> {
  create<V = Record<string, unknown>>(name: string): DataDefineConfig<T & V>;

  extends<V extends DataTypeShape>(
    dataDefine: DataDefine<V>
  ): DataHelper<T & V>;
}

const createDataHelper = <T extends DataTypeShape = Record<string, unknown>>(
  ...supers: DataDefine[]
): DataHelper<T> => {
  return {
    create(name: string) {
      return {
        name,
        supers,
      };
    },
    extends(dataDefine) {
      return createDataHelper(...supers, dataDefine);
    },
  };
};
export const DataHelper = createDataHelper();

export class Typesystem {
  dataMap = new Map<string, DataDefine<any>>();

  defineData<T extends DataTypeShape>(
    config: DataDefineConfig<T>
  ): DataDefine<T> {
    const result = new DataDefine(config, this.dataMap);
    this.dataMap.set(config.name, result);
    return result;
  }

  isDataType(t: TType): t is TDataType {
    return t.type === 'data';
  }

  isSubtype(
    superType: TType,
    sub: TType,
    context?: Record<string, TType>
  ): boolean {
    if (superType.type === 'typeRef') {
      // TODO both are ref
      if (context && sub.type != 'typeRef') {
        context[superType.name] = sub;
      }
      // TODO bound
      return true;
    }
    if (sub.type === 'typeRef') {
      // TODO both are ref
      if (context) {
        context[sub.name] = superType;
      }
      return true;
    }
    if (tUnknown.is(superType)) {
      return true;
    }
    if (superType.type === 'union') {
      return superType.list.some(type => this.isSubtype(type, sub, context));
    }
    if (sub.type === 'union') {
      return sub.list.every(type => this.isSubtype(superType, type, context));
    }

    if (this.isDataType(sub)) {
      const dataDefine = this.dataMap.get(sub.name);
      if (!dataDefine) {
        throw new Error('bug');
      }
      if (!this.isDataType(superType)) {
        return false;
      }
      return dataDefine.isSubOf(superType);
    }

    if (superType.type === 'array' || sub.type === 'array') {
      if (superType.type !== 'array' || sub.type !== 'array') {
        return false;
      }
      return this.isSubtype(superType.ele, sub.ele, context);
    }
    return false;
  }

  subst(context: Record<string, TType>, template: TFunction): TFunction {
    const subst = (type: TType): TType => {
      if (this.isDataType(type)) {
        return type;
      }
      switch (type.type) {
        case 'typeRef':
          return { ...context[type.name] };
        case 'union':
          return tUnion(type.list.map(type => subst(type)));
        case 'array':
          return tArray(subst(type.ele));
        case 'function':
          throw new Error('TODO');
      }
    };
    const result = tFunction({
      args: template.args.map(type => subst(type)),
      rt: subst(template.rt),
    });
    return result;
  }

  instance(
    context: Record<string, TType>,
    realArgs: TType[],
    realRt: TType,
    template: TFunction
  ): TFunction {
    const ctx = { ...context };
    template.args.forEach((arg, i) => {
      const realArg = realArgs[i];
      if (realArg) {
        this.isSubtype(arg, realArg, ctx);
      }
    });
    this.isSubtype(realRt, template.rt);
    return this.subst(ctx, template);
  }
}

export const typesystem = new Typesystem();
export const tUnknown = typesystem.defineData(DataHelper.create('Unknown'));
