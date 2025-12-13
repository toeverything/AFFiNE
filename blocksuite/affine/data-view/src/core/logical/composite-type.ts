import Zod from 'zod';

import type {
  AnyTypeInstance,
  TypeInstance,
  Unify,
  ValueTypeOf,
} from './type.js';
import type {
  TypeVarContext,
  TypeVarDefinitionInstance,
} from './type-variable.js';

type FnValueType<
  Args extends readonly TypeInstance[],
  Return extends TypeInstance,
> = (
  ...args: { [K in keyof Args]: ValueTypeOf<Args[K]> }
) => ValueTypeOf<Return>;

export class FnTypeInstance<
  Args extends readonly TypeInstance[] = readonly TypeInstance[],
  Return extends TypeInstance = TypeInstance,
> implements TypeInstance {
  _validate = fnSchema;

  readonly _valueType = undefined as never as FnValueType<Args, Return>;

  name = 'function';

  constructor(
    readonly args: Args,
    readonly rt: Return,
    readonly vars: TypeVarDefinitionInstance[]
  ) {}

  subst(ctx: TypeVarContext) {
    const newCtx = { ...ctx };
    const args: TypeInstance[] = [];
    for (const arg of this.args) {
      const newArg = arg.subst(newCtx);
      if (!newArg) {
        return;
      }
      args.push(newArg);
    }
    const rt = this.rt.subst(newCtx);
    if (!rt) {
      return;
    }
    return ct.fn.instance(args, rt);
  }

  unify(ctx: TypeVarContext, template: FnTypeInstance, unify: Unify): boolean {
    const newCtx = { ...ctx };

    for (let i = 0; i < template.args.length; i++) {
      const arg = template.args[i];
      const realArg = this.args[i];
      if (arg == null) {
        return false;
      }
      // eslint-disable-next-line sonarjs/no-collapsible-if
      if (realArg != null) {
        if (!unify(newCtx, realArg, arg)) {
          return false;
        }
      }
    }
    return unify(newCtx, template.rt, this.rt);
  }

  valueValidate(value: unknown): value is FnValueType<Args, Return> {
    return fnSchema.safeParse(value).success;
  }
}

const fnSchema = Zod.function();

export class ArrayTypeInstance<
  Element extends TypeInstance = TypeInstance,
> implements TypeInstance {
  readonly _validate;

  readonly _valueType = undefined as never as ValueTypeOf<Element>[];

  readonly name = 'array';

  constructor(readonly element: Element) {
    this._validate = Zod.array(element._validate);
  }

  subst(ctx: TypeVarContext) {
    const ele = this.element.subst(ctx);
    if (!ele) {
      return;
    }
    return ct.array.instance(ele);
  }

  unify(ctx: TypeVarContext, type: ArrayTypeInstance, unify: Unify): boolean {
    return unify(ctx, this.element, type.element);
  }

  valueValidate(value: unknown): value is ValueTypeOf<Element>[] {
    return this._validate.safeParse(value).success;
  }
}

export const ct = {
  fn: {
    is: (type: AnyTypeInstance): type is FnTypeInstance => {
      return type.name === 'function';
    },
    instance: <
      Args extends readonly TypeInstance[],
      Return extends TypeInstance,
    >(
      args: Args,
      rt: Return,
      vars?: TypeVarDefinitionInstance[]
    ) => {
      return new FnTypeInstance(args, rt, vars ?? []);
    },
  },
  array: {
    is: (type: AnyTypeInstance): type is ArrayTypeInstance => {
      return type.name === 'array';
    },
    instance: <Element extends TypeInstance>(
      element: Element
    ): ArrayTypeInstance<Element> => {
      return new ArrayTypeInstance(element);
    },
  },
};
