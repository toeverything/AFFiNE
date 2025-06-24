import type { FnTypeInstance } from './composite-type.js';
import type { TypeConvertConfig, TypeInstance, Unify } from './type.js';
import { converts } from './type-presets.js';
import {
  tv,
  type TypeVarContext,
  type TypeVarReferenceInstance,
} from './type-variable.js';

type From = string;
type To = string;
const setMap2 = <T>(
  map2: Map<string, Map<string, T>>,
  key1: string,
  key2: string,
  value: T
) => {
  let map = map2.get(key1);
  if (!map) {
    map2.set(key1, (map = new Map()));
  }
  map.set(key2, value);
  return map;
};

const getMap2 = <T>(
  map2: Map<string, Map<string, T>>,
  key1: string,
  key2: string
) => {
  return map2.get(key1)?.get(key2);
};

export class TypeSystem {
  private readonly _unify: Unify = (
    ctx: TypeVarContext,
    left: TypeInstance | undefined,
    right: TypeInstance | undefined
  ): boolean => {
    if (left == null) return true;
    if (right == null) return false;
    if (tv.typeVarReference.is(left)) {
      return this.unifyReference(ctx, left, right);
    }
    if (tv.typeVarReference.is(right)) {
      return this.unifyReference(ctx, right, left, false);
    }
    return this.unifyNormalType(ctx, left, right);
  };

  convertMapFromTo = new Map<
    From,
    Map<
      To,
      {
        level: number;
        from: TypeInstance;
        to: TypeInstance;
        convert: (value: unknown) => unknown;
      }
    >
  >();

  convertMapToFrom = new Map<
    From,
    Map<
      To,
      {
        level: number;
        from: TypeInstance;
        to: TypeInstance;
        convert: (value: unknown) => unknown;
      }
    >
  >();

  unify = <T extends TypeInstance>(
    left: TypeInstance | undefined,
    right: T | undefined
  ): left is T => {
    return this._unify({}, left, right);
  };

  constructor(converts: TypeConvertConfig[]) {
    converts.forEach(config => {
      this.registerConvert(config.from, config.to, config.convert);
    });
  }

  private registerConvert(
    from: TypeInstance,
    to: TypeInstance,
    convert: (value: unknown) => unknown,
    level = 0
  ) {
    const currentConfig = getMap2(this.convertMapFromTo, from.name, to.name);
    if (currentConfig && currentConfig.level <= level) {
      return;
    }
    const config = {
      level,
      from,
      to,
      convert,
    };
    setMap2(this.convertMapFromTo, from.name, to.name, config);
    setMap2(this.convertMapToFrom, to.name, from.name, config);
    this.convertMapToFrom.get(from.name)?.forEach(config => {
      this.registerConvert(config.from, to, value =>
        convert(config.convert(value))
      );
    });
  }

  private unifyNormalType(
    ctx: TypeVarContext,
    left: TypeInstance | undefined,
    right: TypeInstance | undefined,
    covariance: boolean = true
  ): boolean {
    if (!left || !right) {
      return false;
    }
    if (left.name !== right.name) {
      [left, right] = covariance ? [left, right] : [right, left];
      const convertConfig = this.convertMapFromTo
        .get(left.name)
        ?.get(right.name);
      if (convertConfig == null) {
        return false;
      }
      left = convertConfig.to;
    }
    return left.unify(ctx, right, this._unify);
  }

  private unifyReference(
    ctx: TypeVarContext,
    left: TypeVarReferenceInstance,
    right: TypeInstance | undefined,
    covariance: boolean = true
  ): boolean {
    if (!right) {
      return false;
    }
    let leftDefine = ctx[left.varName];
    if (!leftDefine) {
      ctx[left.varName] = leftDefine = {
        define: tv.typeVarDefine.create(left.varName),
      };
    }
    const leftType = leftDefine.type;
    if (tv.typeVarReference.is(right)) {
      return this.unifyReference(ctx, right, leftType, !covariance);
    }
    if (!leftType) {
      leftDefine.type = right;
      return true;
    }
    return this.unifyNormalType(ctx, leftType, right, covariance);
  }

  instanceFn(
    template: FnTypeInstance,
    realArgs: TypeInstance[],
    realRt: TypeInstance,
    ctx: TypeVarContext
  ): FnTypeInstance | void {
    const newCtx = {
      ...ctx,
    };
    template.vars.forEach(v => {
      newCtx[v.varName] = {
        define: v,
      };
    });
    for (let i = 0; i < template.args.length; i++) {
      const arg = template.args[i];
      const realArg = realArgs[i];
      if (arg == null) {
        return;
      }
      // eslint-disable-next-line sonarjs/no-collapsible-if
      if (realArg != null) {
        if (!this._unify(newCtx, realArg, arg)) {
          return;
        }
      }
    }
    this._unify(newCtx, template.rt, realRt);
    return template.subst(newCtx);
  }
}

export const typeSystem = new TypeSystem(converts);
